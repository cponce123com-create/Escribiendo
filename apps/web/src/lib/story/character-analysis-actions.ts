"use server";
import { prisma } from "@/lib/db";
import { beginStoryAction, storyBookExists } from "./action-helpers";
import type { NarrativeSection } from "./character-analysis";
import { analyzeAndFilterCharacterCandidates } from "./character-analysis-quality";
function flatten(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown[] };
  const own = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content)
    ? node.content.map(flatten).filter(Boolean).join(" ")
    : "";
  return [own, children].filter(Boolean).join(" ");
}
export async function analyzeBookCharacters(bookId: string) {
  const start = await beginStoryAction();
  if (!start.ok)
    return { ok: false as const, error: start.state.message ?? "No se pudo validar la sesión." };
  if (!(await storyBookExists(start.session, bookId)))
    return { ok: false as const, error: "El libro no existe en este espacio de trabajo." };
  const sections = await prisma.bookSection.findMany({
    where: { bookId, deletedAt: null, isHidden: false },
    orderBy: [{ sortOrder: "asc" }],
    select: { title: true, type: true, content: true },
  });
  const narrative: NarrativeSection[] = sections
    .filter(
      (s) =>
        ![
          "TITLE_PAGE",
          "COPYRIGHT",
          "DEDICATION",
          "TABLE_OF_CONTENTS",
          "BIBLIOGRAPHY",
          "GLOSSARY",
          "ABOUT_AUTHOR",
        ].includes(s.type),
    )
    .map((s) => ({ title: s.title, text: flatten(s.content) }))
    .filter((s) => s.text.length > 0);
  if (!narrative.length)
    return {
      ok: true as const,
      candidates: [],
      sections: 0,
      notice: "Aún no hay texto narrativo para analizar.",
    };
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: start.session.workspace.id, deletedAt: null },
    select: { title: true },
  });
  if (!book) return { ok: false as const, error: "El libro no existe en este espacio de trabajo." };

  const existing = await prisma.storyCharacter.findMany({
    where: { workspaceId: start.session.workspace.id, bookId, deletedAt: null },
    select: { name: true },
  });
  const candidates = analyzeAndFilterCharacterCandidates(narrative, {
    bookTitle: book.title,
    existingCharacterNames: existing.map((character) => character.name),
  });
  return {
    ok: true as const,
    candidates,
    sections: narrative.length,
    notice:
      "El análisis es local y orientativo. Revisa cada evidencia; los nombres no se fusionan automáticamente.",
  };
}
