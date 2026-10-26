import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@escribiendo/database";
import type { SessionContext } from "@/lib/auth/session";
import type { CharacterCandidate } from "./character-analysis";
import { personalIdentity } from "./personal-name";
export interface CharacterSourceSnapshot {
  id: string;
  contentHash: string;
  version: number;
}
/** Conserva claves y decisiones históricas; nuevas identidades usan hash Unicode sin confundir ñ/n. */
export async function persistVerifiedCharacters(
  session: SessionContext,
  bookId: string,
  sources: CharacterSourceSnapshot[],
  candidates: CharacterCandidate[],
  taskId?: string,
) {
  const current = candidates.slice(0, 100);
  const previous = await prisma.storyCharacterSuggestion.findMany({
    where: { bookId, workspaceId: session.workspace.id },
    select: { suggestedName: true, normalizedName: true, status: true },
    take: 5000,
    orderBy: { createdAt: "asc" },
  });
  const keys = new Map<string, string>();
  for (const item of [...previous].sort(
    (a, b) => Number(a.status === "PENDING") - Number(b.status === "PENDING"),
  ))
    if (!keys.has(personalIdentity(item.suggestedName)))
      keys.set(personalIdentity(item.suggestedName), item.normalizedName);
  const byId = new Map(sources.map((source) => [source.id, source]));
  return prisma.$transaction(
    async (tx) => {
      const versions = await tx.bookSection.findMany({
        where: {
          id: { in: sources.map((source) => source.id) },
          bookId,
          deletedAt: null,
          book: { workspaceId: session.workspace.id, deletedAt: null },
        },
        select: { id: true, version: true },
      });
      if (
        versions.length !== sources.length ||
        versions.some((row) => byId.get(row.id)?.version !== row.version)
      )
        throw new Error("CHARACTER_SOURCE_CHANGED");
      if (taskId) {
        const active = await tx.characterAnalysisTask.findFirst({
          where: { id: taskId, bookId, workspaceId: session.workspace.id, status: "PROCESSING" },
          select: { id: true },
        });
        if (!active) throw new Error("CHARACTER_TASK_SUPERSEDED");
      } else {
        await tx.characterAnalysisTask.updateMany({
          where: {
            bookId,
            workspaceId: session.workspace.id,
            status: { in: ["PENDING", "PROCESSING", "FAILED"] },
            OR: sources.map((source) => ({
              sectionId: source.id,
              contentHash: source.contentHash,
            })),
          },
          data: { status: "SUPERSEDED", completedAt: new Date() },
        });
      }
      await tx.storyCharacterSuggestion.updateMany({
        where: {
          bookId,
          workspaceId: session.workspace.id,
          sectionId: { in: sources.map((source) => source.id) },
          status: "PENDING",
        },
        data: { stale: true },
      });
      let saved = 0;
      for (const candidate of current) {
        const evidence = candidate.evidence[0],
          source = evidence?.sectionId
            ? byId.get(evidence.sectionId)
            : sources.length === 1
              ? sources[0]
              : undefined;
        if (!source || !evidence || !candidate.nameVerification) continue;
        const identity = personalIdentity(candidate.name),
          normalizedName =
            keys.get(identity) ?? `v2:${createHash("sha256").update(identity).digest("hex")}`;
        const payload = {
          sectionId: source.id,
          contentHash: source.contentHash,
          suggestedName: candidate.name,
          suggestedAge: candidate.age ?? null,
          suggestedDescription: candidate.description ?? null,
          excerpt: evidence.excerpt,
          confidence: candidate.confidence,
          mentions: candidate.mentions,
          stale: false,
          nameVerification: {
            ...candidate.nameVerification,
            variants: candidate.aliases.slice(0, 10),
            secondaryEvidence: candidate.evidence
              .slice(1, 3)
              .filter((item) => !!item.sectionId)
              .map((item) => ({
                sectionId: item.sectionId!,
                sectionTitle: item.section,
                nameUsed: item.nameUsed ?? candidate.name,
                excerpt: item.excerpt.slice(0, 500),
              })),
          } as unknown as Prisma.InputJsonValue,
        };
        await tx.storyCharacterSuggestion.upsert({
          where: { bookId_normalizedName: { bookId, normalizedName } },
          create: { ...payload, workspaceId: session.workspace.id, bookId, normalizedName },
          update: payload,
        });
        saved++;
      }
      return saved;
    },
    { timeout: 30_000 },
  );
}
