"use server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { storyIdSchema } from "./validation";
import { beginStoryAction } from "./action-helpers";
import type { NarrativeSection } from "./character-analysis";
import { verifyCharacterNamesResult } from "./character-name-verifier";
import { filterCharacterCandidates } from "./character-analysis-quality";
import { extractPlainText } from "./engine/text";
import { editorialOrder } from "@/lib/books/reading-order";
import {
  persistVerifiedCharacters,
  type CharacterSourceSnapshot,
} from "./verified-character-storage";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertCanPerform } from "@/lib/books/permissions";
import { revalidatePath } from "next/cache";
const EXCLUDED = new Set([
  "TITLE_PAGE",
  "COPYRIGHT",
  "DEDICATION",
  "TABLE_OF_CONTENTS",
  "BIBLIOGRAPHY",
  "GLOSSARY",
  "ABOUT_AUTHOR",
]);
/** Revisión explícita global: ida y vuelta comparten el contexto de los capítulos leídos. */
export async function analyzeBookCharacters(bookId: string) {
  const start = await beginStoryAction();
  if (!start.ok)
    return { ok: false as const, error: start.state.message ?? "No se pudo validar la sesión." };
  assertCanPerform(start.session.workspace.role, "story:manage");
  if (!storyIdSchema.safeParse(bookId).success)
    return { ok: false as const, error: "Identificador de libro no válido." };
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: start.session.workspace.id, deletedAt: null },
    select: { title: true },
  });
  if (!book) return { ok: false as const, error: "El libro no existe en este espacio de trabajo." };
  try {
    const [metadata, existing] = await Promise.all([
      prisma.bookSection.findMany({
        where: { bookId, deletedAt: null, isHidden: false },
        select: { id: true, title: true, type: true, parentId: true, sortOrder: true },
      }),
      prisma.storyCharacter.findMany({
        where: { workspaceId: start.session.workspace.id, bookId, deletedAt: null },
        select: { name: true },
      }),
    ]);
    const eligible = editorialOrder(metadata, false).filter(
      (section) => !EXCLUDED.has(section.type),
    );
    const selected = eligible.slice(0, 200),
      narrative: NarrativeSection[] = [],
      sources: CharacterSourceSnapshot[] = [];
    let bytes = 0,
      limited = eligible.length > selected.length;
    for (let offset = 0; offset < selected.length; offset += 5) {
      const rows = await prisma.bookSection.findMany({
        where: {
          bookId,
          id: { in: selected.slice(offset, offset + 5).map((row) => row.id) },
          deletedAt: null,
          isHidden: false,
          book: { workspaceId: start.session.workspace.id, deletedAt: null },
        },
        select: { id: true, title: true, version: true, content: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const meta of selected.slice(offset, offset + 5)) {
        const row = byId.get(meta.id);
        if (!row) continue;
        const json = JSON.stringify(row.content),
          size = Buffer.byteLength(json, "utf8");
        if (bytes + size > 16_000_000) {
          limited = true;
          continue;
        }
        bytes += size;
        const text = extractPlainText(json);

        if (text.length > 1_000_000) limited = true;
        if (text.trim()) narrative.push({ id: row.id, title: row.title, text });
        sources.push({
          id: row.id,
          version: row.version,
          contentHash: createHash("sha256").update(json).digest("hex"),
        });
      }
    }
    if (narrative.reduce((sum, section) => sum + section.text.length, 0) > 8_000_000)
      limited = true;
    const report = verifyCharacterNamesResult(narrative);
    limited ||= report.limitsHit.length > 0;
    const candidates = filterCharacterCandidates(report.candidates, {
      sectionText: narrative.map((section) => section.text).join("\n"),
      bookTitle: book.title,
      existingCharacterNames: existing.map((character) => character.name),
    });
    const saved = sources.length
      ? await persistVerifiedCharacters(start.session, bookId, sources, candidates)
      : 0;
    await writeAuditLog(
      {
        action: "CHARACTER_NAMES_VERIFIED_BIDIRECTIONALLY",
        entityType: "Book",
        entityId: bookId,
        workspaceId: start.session.workspace.id,
        actorId: start.session.user.id,
        metadata: { sections: sources.length, suggestions: saved, limited },
      },
      start.context,
    );
    revalidatePath("/characters");
    return {
      ok: true as const,
      candidates,
      sections: sources.length,
      notice: `Verificación de ida y vuelta completada en ${sources.length} secciones. ${saved} sugerencias actuales.${limited || candidates.length > 100 ? " Se aplicaron límites de seguridad; el resultado es parcial." : ""} Los apellidos probables y las variantes ambiguas requieren confirmación.`,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error && error.message === "CHARACTER_SOURCE_CHANGED"
          ? "El manuscrito cambió durante el análisis. Vuelve a analizarlo."
          : "No se pudo completar la verificación de personajes.",
    };
  }
}
