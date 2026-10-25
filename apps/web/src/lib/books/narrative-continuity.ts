import "server-only";
import { createHash } from "node:crypto";
import type { NarrativeFindingStatus } from "@escribiendo/database";
import {
  NARRATIVE_FACT_RULE_VERSION,
  detectNarrativeInconsistencies,
  type NarrativeFactEvidence,
  type NarrativeInconsistency,
} from "@escribiendo/book-schema";
import type { SessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export interface NarrativeContinuityFact extends NarrativeFactEvidence {
  id: string;
  sourceValueText: string;
  reviewStatus: "PROPOSED" | "CONFIRMED" | "REJECTED" | "STALE";
  reviewedAt: Date | null;
}

export interface NarrativeContinuityFinding extends NarrativeInconsistency {
  factA: NarrativeContinuityFact;
  factB: NarrativeContinuityFact | null;
  decision: {
    status: NarrativeFindingStatus;
    note: string | null;
    updatedAt: Date;
    decisionVersion: number;
    history: Array<{
      version: number;
      status: NarrativeFindingStatus;
      note: string | null;
      createdAt: Date;
      actorName: string;
    }>;
  } | null;
}

export interface NarrativeContinuityPageData {
  book: { id: string; title: string };
  sections: Array<{
    id: string;
    title: string;
    type: string;
    version: number;
    analyzed: boolean;
    factCount: number;
  }>;
  facts: NarrativeContinuityFact[];
  findings: NarrativeContinuityFinding[];
  counts: {
    facts: number;
    findings: number;
    open: number;
    chaptersAnalyzed: number;
    totalChapters: number;
  };
}

/** SHA-256 sobre JSON serializado del editor; identifica una instantánea exacta. */
export function hashNarrativeContent(content: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(content) ?? "null")
    .digest("hex");
}

export function narrativeFindingStorageKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Consulta solo entidades/fuentes del espacio de trabajo y calcula alertas sobre
 * evidencias que coinciden con la versión vigente de cada capítulo.
 */
export async function loadNarrativeContinuity(
  session: SessionContext,
  bookId: string,
): Promise<NarrativeContinuityPageData | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!book) return null;

  const [sections, storedFacts, storedDecisions, storedAnalyses] = await Promise.all([
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { id: true, title: true, type: true, version: true, content: true },
    }),
    prisma.narrativeFact.findMany({
      where: { workspaceId: session.workspace.id, bookId, reviewStatus: { not: "STALE" } },
      orderBy: [{ sectionId: "asc" }, { startOffset: "asc" }],
      select: {
        id: true,
        sectionId: true,
        section: { select: { title: true } },
        contentVersion: true,
        contentHash: true,
        factType: true,
        subjectLabel: true,
        subjectNormalized: true,
        valueText: true,
        normalizedValue: true,
        authorValueOverride: true,
        authorNormalizedOverride: true,
        evidenceMode: true,
        confidence: true,
        temporalYear: true,
        startOffset: true,
        endOffset: true,
        exactQuote: true,
        ruleVersion: true,
        reviewStatus: true,
        reviewedAt: true,
      },
    }),
    prisma.narrativeFindingDecision.findMany({
      where: { workspaceId: session.workspace.id, bookId },
      select: {
        findingKey: true,
        status: true,
        note: true,
        updatedAt: true,
        decisionVersion: true,
        history: {
          orderBy: { version: "asc" },
          select: {
            version: true,
            status: true,
            note: true,
            createdAt: true,
            decidedBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.narrativeSectionAnalysis.findMany({
      where: { workspaceId: session.workspace.id, bookId },
      select: {
        sectionId: true,
        contentVersion: true,
        contentHash: true,
        ruleVersion: true,
        factsCount: true,
      },
    }),
  ]);

  const currentHashes = new Map(
    sections.map((section) => [section.id, hashNarrativeContent(section.content)]),
  );
  const facts: NarrativeContinuityFact[] = storedFacts
    .filter(
      (item) =>
        currentHashes.get(item.sectionId) === item.contentHash &&
        sections.find((section) => section.id === item.sectionId)?.version ===
          item.contentVersion &&
        item.ruleVersion === NARRATIVE_FACT_RULE_VERSION,
    )
    .map((item) => ({
      id: item.id,
      sourceValueText: item.valueText,
      sectionId: item.sectionId,
      sectionTitle: item.section.title,
      contentVersion: item.contentVersion,
      contentHash: item.contentHash,
      factType: item.factType as NarrativeFactEvidence["factType"],
      subjectLabel: item.subjectLabel,
      subjectNormalized: item.subjectNormalized,
      valueText: item.authorValueOverride ?? item.valueText,
      normalizedValue: item.authorNormalizedOverride ?? item.normalizedValue,
      evidenceMode: item.evidenceMode,
      confidence: item.confidence,
      temporalYear: item.temporalYear,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      exactQuote: item.exactQuote,
      ruleVersion: item.ruleVersion,
      reviewStatus: item.reviewStatus,
      reviewedAt: item.reviewedAt,
    }));

  const decisions = new Map(storedDecisions.map((decision) => [decision.findingKey, decision]));
  const findingRows = detectNarrativeInconsistencies(facts)
    .map((finding) => {
      const decision = decisions.get(narrativeFindingStorageKey(finding.findingKey));
      const factA = facts.find((item) => item.id === finding.factA.id);
      const factB = finding.factB
        ? (facts.find((item) => item.id === finding.factB?.id) ?? null)
        : null;
      if (!factA) return null;
      return {
        ...finding,
        findingKey: narrativeFindingStorageKey(finding.findingKey),
        factA,
        factB,
        decision: decision
          ? {
              status: decision.status,
              note: decision.note,
              updatedAt: decision.updatedAt,
              decisionVersion: decision.decisionVersion,
              history: decision.history.map((item) => ({
                version: item.version,
                status: item.status,
                note: item.note,
                createdAt: item.createdAt,
                actorName: item.decidedBy.name,
              })),
            }
          : null,
      } satisfies NarrativeContinuityFinding;
    })
    .filter((item): item is NarrativeContinuityFinding => item !== null);

  const currentAnalyses = storedAnalyses.filter(
    (item) =>
      currentHashes.get(item.sectionId) === item.contentHash &&
      sections.find((section) => section.id === item.sectionId)?.version === item.contentVersion &&
      item.ruleVersion === NARRATIVE_FACT_RULE_VERSION,
  );
  const analysisBySection = new Map(currentAnalyses.map((item) => [item.sectionId, item]));
  const open = findingRows.filter(
    (finding) => !finding.decision || finding.decision.status === "OPEN",
  ).length;

  return {
    book,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      type: section.type,
      version: section.version,
      analyzed: analysisBySection.has(section.id),
      factCount: analysisBySection.get(section.id)?.factsCount ?? 0,
    })),
    facts,
    findings: findingRows,
    counts: {
      facts: facts.length,
      findings: findingRows.length,
      open,
      chaptersAnalyzed: currentAnalyses.length,
      totalChapters: sections.length,
    },
  };
}
