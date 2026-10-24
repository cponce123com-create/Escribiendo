"use server";
import { revalidatePath } from "next/cache";
import {
  NARRATIVE_FACT_RULE_VERSION,
  extractNarrativeFacts,
  normalizeSpanishForComparison,
  parseTiptapDocument,
} from "@escribiendo/book-schema";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { beginStoryAction, logStoryError } from "@/lib/story/action-helpers";
import { hashNarrativeContent, loadNarrativeContinuity } from "./narrative-continuity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FINDING_STATUSES = new Set([
  "OPEN",
  "CONFIRMED",
  "TEXT_CORRECTED",
  "IGNORED",
  "INTENTIONAL",
  "FACT_UPDATED",
]);

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function uniqueCharacters(rows: Array<{ id: string; name: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const normalized = normalizeSpanishForComparison(row.name.trim());
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return rows
    .filter((row) => counts.get(normalizeSpanishForComparison(row.name.trim())) === 1)
    .map((row) => ({ id: row.id, name: row.name }));
}

/** Analiza solo el capítulo solicitado. El hash hace idempotente cada instantánea. */
export async function analyzeNarrativeSectionAction(data: FormData): Promise<void> {
  const start = await beginStoryAction();
  if (!start.ok) return;
  const { session, context } = start;
  const bookId = formText(data, "bookId");
  const sectionId = formText(data, "sectionId");
  if (!UUID.test(bookId) || !UUID.test(sectionId)) return;

  try {
    const section = await prisma.bookSection.findFirst({
      where: {
        id: sectionId,
        bookId,
        deletedAt: null,
        isHidden: false,
        book: { workspaceId: session.workspace.id, deletedAt: null },
      },
      select: { id: true, title: true, content: true, version: true },
    });
    if (!section) return;

    const [characters, places, revision] = await Promise.all([
      prisma.storyCharacter.findMany({
        where: {
          workspaceId: session.workspace.id,
          deletedAt: null,
          OR: [{ bookId }, { bookId: null }],
        },
        select: { id: true, name: true },
      }),
      prisma.storyWorld.findMany({
        where: {
          workspaceId: session.workspace.id,
          deletedAt: null,
          kind: "PLACE",
          OR: [{ bookId }, { bookId: null }],
        },
        select: { id: true, name: true },
      }),
      prisma.sectionRevision.findUnique({
        where: { sectionId_version: { sectionId, version: section.version } },
        select: { id: true, content: true },
      }),
    ]);

    const contentHash = hashNarrativeContent(section.content);
    let document;
    try {
      document = parseTiptapDocument(section.content);
    } catch {
      return;
    }
    const revisionId =
      revision && hashNarrativeContent(revision.content) === contentHash ? revision.id : null;
    const extracted = extractNarrativeFacts({
      sectionId,
      sectionTitle: section.title,
      contentVersion: section.version,
      contentHash,
      document,
      characters: uniqueCharacters(characters),
      places: uniqueCharacters(places),
    });

    const persisted = await prisma.$transaction(async (tx) => {
      await tx.narrativeFact.updateMany({
        where: { sectionId, contentHash: { not: contentHash }, reviewStatus: "PROPOSED" },
        data: { reviewStatus: "STALE" },
      });
      const rows = [];
      for (const item of extracted) {
        const key = {
          sectionId_contentHash_startOffset_endOffset_factType: {
            sectionId,
            contentHash,
            startOffset: item.startOffset,
            endOffset: item.endOffset,
            factType: item.factType,
          },
        };
        const existing = await tx.narrativeFact.findUnique({
          where: key,
          select: { reviewStatus: true },
        });
        const saved = await tx.narrativeFact.upsert({
          where: key,
          create: {
            workspaceId: session.workspace.id,
            bookId,
            sectionId,
            revisionId,
            contentVersion: section.version,
            contentHash,
            factType: item.factType,
            subjectLabel: item.subjectLabel,
            subjectNormalized: item.subjectNormalized,
            valueText: item.valueText,
            normalizedValue: item.normalizedValue,
            evidenceMode: item.evidenceMode,
            confidence: item.confidence,
            temporalYear: item.temporalYear,
            startOffset: item.startOffset,
            endOffset: item.endOffset,
            exactQuote: item.exactQuote,
            ruleVersion: item.ruleVersion,
            reviewStatus: "PROPOSED",
          },
          update:
            existing?.reviewStatus === "STALE"
              ? {
                  contentVersion: section.version,
                  revisionId,
                  subjectLabel: item.subjectLabel,
                  subjectNormalized: item.subjectNormalized,
                  valueText: item.valueText,
                  normalizedValue: item.normalizedValue,
                  evidenceMode: item.evidenceMode,
                  confidence: item.confidence,
                  temporalYear: item.temporalYear,
                  exactQuote: item.exactQuote,
                  ruleVersion: item.ruleVersion,
                  reviewStatus: "PROPOSED",
                  reviewedById: null,
                  reviewedAt: null,
                }
              : {},
          select: { id: true },
        });
        rows.push(saved);
      }
      await tx.narrativeSectionAnalysis.upsert({
        where: { sectionId_contentHash: { sectionId, contentHash } },
        create: {
          workspaceId: session.workspace.id,
          bookId,
          sectionId,
          contentVersion: section.version,
          contentHash,
          ruleVersion: NARRATIVE_FACT_RULE_VERSION,
          factsCount: extracted.length,
        },
        update: {
          contentVersion: section.version,
          ruleVersion: NARRATIVE_FACT_RULE_VERSION,
          factsCount: extracted.length,
          analyzedAt: new Date(),
        },
      });
      return rows;
    });

    await writeAuditLog(
      {
        action: "narrative.continuity.section_analyzed",
        entityType: "book_section",
        entityId: sectionId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        requestId: context.requestId,
        metadata: {
          contentVersion: section.version,
          factsFound: persisted.length,
          rules: "continuity-1.0.0",
        },
      },
      context,
    );
    revalidatePath(`/books/${bookId}/continuity`);
    revalidatePath(`/books/${bookId}/analysis`);
  } catch (error) {
    logStoryError("narrative.continuity.analysis_failed", context, error);
  }
}

/** Registra la resolución editorial de una alerta solo si aún existe en el libro actual. */
export async function decideNarrativeFindingAction(data: FormData): Promise<void> {
  const start = await beginStoryAction();
  if (!start.ok) return;
  const { session, context } = start;
  const bookId = formText(data, "bookId");
  const submittedKey = formText(data, "findingKey");
  const status = formText(data, "status");
  const note = formText(data, "note").slice(0, 500);
  if (!UUID.test(bookId) || !/^[0-9a-f]{64}$/iu.test(submittedKey) || !FINDING_STATUSES.has(status))
    return;

  try {
    const continuity = await loadNarrativeContinuity(session, bookId);
    const finding = continuity?.findings.find((item) => item.findingKey === submittedKey);
    if (!finding) return;
    const factAId = finding.factA.id;
    const factBId = finding.factB?.id ?? null;
    const storedKey = finding.findingKey;
    const statusValue = status as
      "OPEN" | "CONFIRMED" | "TEXT_CORRECTED" | "IGNORED" | "INTENTIONAL" | "FACT_UPDATED";
    const savedDecision = await prisma.$transaction(async (tx) => {
      const saved = await tx.narrativeFindingDecision.upsert({
        where: { findingKey: storedKey },
        create: {
          workspaceId: session.workspace.id,
          bookId,
          findingKey: storedKey,
          findingType: finding.type,
          factAId,
          factBId,
          status: statusValue,
          note: note || null,
          decidedById: session.user.id,
        },
        update: {
          findingType: finding.type,
          factAId,
          factBId,
          status: statusValue,
          note: note || null,
          decidedById: session.user.id,
          decisionVersion: { increment: 1 },
        },
        select: { id: true, decisionVersion: true },
      });
      await tx.narrativeFindingDecisionHistory.create({
        data: {
          decisionId: saved.id,
          version: saved.decisionVersion,
          status: statusValue,
          note: note || null,
          decidedById: session.user.id,
        },
      });
      return saved;
    });
    await writeAuditLog(
      {
        action: "narrative.continuity.finding_decided",
        entityType: "narrative_finding",
        entityId: storedKey,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        requestId: context.requestId,
        metadata: { bookId, status, decisionVersion: savedDecision.decisionVersion },
      },
      context,
    );
    revalidatePath(`/books/${bookId}/continuity`);
  } catch (error) {
    logStoryError("narrative.continuity.decision_failed", context, error);
  }
}

/** Confirmar/rechazar una afirmación mantiene intactos su cita y su versión fuente. */
export async function reviewNarrativeFactAction(data: FormData): Promise<void> {
  const start = await beginStoryAction();
  if (!start.ok) return;
  const { session, context } = start;
  const bookId = formText(data, "bookId");
  const factId = formText(data, "factId");
  const status = formText(data, "status");
  if (!UUID.test(bookId) || !UUID.test(factId) || (status !== "CONFIRMED" && status !== "REJECTED"))
    return;

  try {
    const fact = await prisma.narrativeFact.findFirst({
      where: {
        id: factId,
        bookId,
        workspaceId: session.workspace.id,
        reviewStatus: { not: "STALE" },
      },
      include: { section: { select: { content: true } } },
    });
    if (!fact || hashNarrativeContent(fact.section.content) !== fact.contentHash) return;
    await prisma.narrativeFact.update({
      where: { id: factId },
      data: { reviewStatus: status, reviewedById: session.user.id, reviewedAt: new Date() },
    });
    await writeAuditLog(
      {
        action: "narrative.continuity.fact_reviewed",
        entityType: "narrative_fact",
        entityId: factId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        requestId: context.requestId,
        metadata: { bookId, status, factType: fact.factType, contentVersion: fact.contentVersion },
      },
      context,
    );
    revalidatePath(`/books/${bookId}/continuity`);
  } catch (error) {
    logStoryError("narrative.continuity.fact_review_failed", context, error);
  }
}

/** Corrige solo el registro canónico; la extracción y el fragmento original quedan intactos. */
export async function updateNarrativeFactRecordAction(data: FormData): Promise<void> {
  const start = await beginStoryAction();
  if (!start.ok) return;
  const { session, context } = start;
  const bookId = formText(data, "bookId");
  const factId = formText(data, "factId");
  const canonicalValue = formText(data, "canonicalValue").slice(0, 300);
  if (!UUID.test(bookId) || !UUID.test(factId)) return;

  try {
    const fact = await prisma.narrativeFact.findFirst({
      where: {
        id: factId,
        bookId,
        workspaceId: session.workspace.id,
        reviewStatus: { not: "STALE" },
      },
      include: { section: { select: { content: true } } },
    });
    if (!fact || hashNarrativeContent(fact.section.content) !== fact.contentHash) return;
    await prisma.narrativeFact.update({
      where: { id: factId },
      data: canonicalValue
        ? {
            authorValueOverride: canonicalValue,
            authorNormalizedOverride: normalizeSpanishForComparison(canonicalValue),
            overrideById: session.user.id,
            overrideAt: new Date(),
            reviewStatus: "CONFIRMED",
            reviewedById: session.user.id,
            reviewedAt: new Date(),
          }
        : {
            authorValueOverride: null,
            authorNormalizedOverride: null,
            overrideById: null,
            overrideAt: null,
            reviewStatus: "PROPOSED",
            reviewedById: null,
            reviewedAt: null,
          },
    });
    await writeAuditLog(
      {
        action: "narrative.continuity.fact_record_updated",
        entityType: "narrative_fact",
        entityId: factId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        requestId: context.requestId,
        metadata: {
          bookId,
          factType: fact.factType,
          contentVersion: fact.contentVersion,
          overrideSet: Boolean(canonicalValue),
        },
      },
      context,
    );
    revalidatePath(`/books/${bookId}/continuity`);
  } catch (error) {
    logStoryError("narrative.continuity.fact_record_update_failed", context, error);
  }
}
