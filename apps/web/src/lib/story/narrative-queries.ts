import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { extractPlainText, wordCount } from "./engine/text";
import { dialogueBlocks, extractSpeaker } from "./dialogue-analysis";

export interface DialogueIntervention {
  text: string;
  words: number;
  sectionId: string;
  sectionTitle: string;
  narrativeOrder: number;
  speaker: string | null;
  confidence: number;
  long: boolean;
}

export interface DialogueChapterMetric {
  sectionId: string;
  title: string;
  narrativeOrder: number;
  words: number;
  dialogueWords: number;
  dialoguePercentage: number;
  interventions: number;
  meanInterventionWords: number;
}

export interface NarrativeDashboard {
  book: { id: string; title: string };
  chapters: DialogueChapterMetric[];
  interventions: DialogueIntervention[];
  attributionPatterns: Array<{ label: string; count: number }>;
  characters: Array<{
    id: string;
    name: string;
    role: string;
    aliases: string[];
    appearances: number;
    firstAppearance: string | null;
    lastAppearance: string | null;
  }>;
  relations: Array<{
    id: string;
    source: { id: string; name: string };
    target: { id: string; name: string };
    kind: string;
    description: string | null;
  }>;
  timeline: Array<{
    id: string;
    title: string;
    details: string | null;
    sourceExcerpt: string | null;
    sectionId: string | null;
    sectionTitle: string | null;
    narrativeOrder: number;
    chronologicalOrder: number;
    suggested: boolean;
    characterName: string;
  }>;
  planning: Array<{
    id: string;
    title: string;
    kind: string;
    status: string;
    summary: string | null;
  }>;
}

const ATTRIBUTION_PATTERNS = [
  ["dijo + nombre", /\bdijo\s+[\p{Lu}]/gu],
  ["preguntó + nombre", /\bpreguntó\s+[\p{Lu}]/gu],
  ["respondió + nombre", /\brespondió\s+[\p{Lu}]/gu],
  ["dijo él/ella", /\bdijo\s+(?:él|ella)/giu],
] as const;

export async function getNarrativeDashboard(
  session: SessionContext,
  bookId: string,
): Promise<NarrativeDashboard | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!book) return null;
  const [sections, characters, relations, events, planning] = await Promise.all([
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, content: true, wordCount: true, sortOrder: true },
    }),
    prisma.storyCharacter.findMany({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, notes: true },
    }),
    prisma.storyCharacterRelation.findMany({
      where: { bookId, workspaceId: session.workspace.id },
      include: {
        source: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.storyCharacterEvent.findMany({
      where: { bookId, workspaceId: session.workspace.id },
      include: {
        character: { select: { name: true } },
      },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    }),
    prisma.storyPlanItem.findMany({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, kind: true, status: true, summary: true },
    }),
  ]);
  // sectionId es un escalar, no una relación de Prisma. Resolver las referencias
  // en una sola consulta evita inventar un include y conserva el ámbito del libro.
  const eventSectionIds = [
    ...new Set(events.flatMap((event) => (event.sectionId ? [event.sectionId] : []))),
  ];
  const eventSections = eventSectionIds.length
    ? await prisma.bookSection.findMany({
        where: {
          id: { in: eventSectionIds },
          bookId,
          deletedAt: null,
          book: { workspaceId: session.workspace.id, deletedAt: null },
        },
        select: { id: true, title: true, sortOrder: true },
      })
    : [];
  const eventSectionById = new Map(eventSections.map((section) => [section.id, section]));
  const chapterMetrics: DialogueChapterMetric[] = [];
  const interventions: DialogueIntervention[] = [];
  const attributionCounts = new Map<string, number>();
  const appearanceMap = new Map<string, number>();
  const firstMap = new Map<string, string>();
  const lastMap = new Map<string, string>();
  for (const [index, section] of sections.entries()) {
    const text = extractPlainText(JSON.stringify(section.content));
    const blocks = dialogueBlocks(text);
    const chapterWords = wordCount(text);
    let dialogueWords = 0;
    for (const block of blocks) {
      const words = wordCount(block);
      dialogueWords += words;
      const resolved = extractSpeaker(block, characters);
      interventions.push({
        text: block,
        words,
        sectionId: section.id,
        sectionTitle: section.title,
        narrativeOrder: index + 1,
        speaker: resolved.speaker,
        confidence: resolved.confidence,
        long: words > 80,
      });
    }
    for (const [label, pattern] of ATTRIBUTION_PATTERNS) {
      const count = [...text.matchAll(pattern)].length;
      if (count) attributionCounts.set(label, (attributionCounts.get(label) ?? 0) + count);
    }
    for (const character of characters) {
      const mentions = text.match(
        new RegExp(
          `(?<![\\p{L}])${character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`,
          "giu",
        ),
      );
      if (mentions?.length) {
        appearanceMap.set(character.id, (appearanceMap.get(character.id) ?? 0) + mentions.length);
        if (!firstMap.has(character.id)) firstMap.set(character.id, section.title);
        lastMap.set(character.id, section.title);
      }
    }
    chapterMetrics.push({
      sectionId: section.id,
      title: section.title,
      narrativeOrder: index + 1,
      words: chapterWords,
      dialogueWords,
      dialoguePercentage: chapterWords ? Math.round((dialogueWords / chapterWords) * 1000) / 10 : 0,
      interventions: blocks.length,
      meanInterventionWords: blocks.length
        ? Math.round((dialogueWords / blocks.length) * 10) / 10
        : 0,
    });
  }
  return {
    book,
    chapters: chapterMetrics,
    interventions: interventions.sort((a, b) => Number(b.long) - Number(a.long)),
    attributionPatterns: [...attributionCounts.entries()].map(([label, count]) => ({
      label,
      count,
    })),
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role,
      aliases:
        (character.notes ?? "")
          .match(/(?:alias|apodo)s?\s*:\s*([^\n]+)/i)?.[1]
          ?.split(/,|;/)
          .map((v) => v.trim())
          .filter(Boolean) ?? [],
      appearances: appearanceMap.get(character.id) ?? 0,
      firstAppearance: firstMap.get(character.id) ?? null,
      lastAppearance: lastMap.get(character.id) ?? null,
    })),
    relations: relations.map(({ id, source, target, kind, description }) => ({
      id,
      source,
      target,
      kind,
      description,
    })),
    timeline: events.map((event) => ({
      id: event.id,
      title: event.title,
      details: event.details,
      sourceExcerpt: event.sourceExcerpt,
      sectionId: event.sectionId,
      sectionTitle: event.sectionId ? (eventSectionById.get(event.sectionId)?.title ?? null) : null,
      narrativeOrder: event.sectionId ? (eventSectionById.get(event.sectionId)?.sortOrder ?? 0) : 0,
      chronologicalOrder: event.sequence,
      suggested: event.suggested,
      characterName: event.character.name,
    })),
    planning,
  };
}
