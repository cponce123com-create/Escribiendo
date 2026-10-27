"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  countWordsInDocument,
  parseTiptapDocument,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import type { Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { canPerform } from "./permissions";
import { withSerializableRetry } from "./serializable";
import {
  buildSearchPattern,
  MAX_MATCHES,
  replaceDocument,
  searchDocument,
  type MatchExcerpt,
} from "./search-replace";

const optionsSchema = z.object({
  query: z.string().trim().min(1).max(200),
  regex: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  replacement: z.string().max(200).optional(),
});

export interface SearchSectionResult {
  sectionId: string;
  sectionTitle: string;
  count: number;
  excerpts: MatchExcerpt[];
}

export type SearchBookResponse =
  | { ok: true; total: number; sections: SearchSectionResult[]; truncated: boolean }
  | { ok: false; error: string };

export type ReplaceBookResponse =
  { ok: true; sections: number; replacements: number } | { ok: false; error: string };

interface SearchContext {
  session: SessionContext;
  book: { id: string; title: string };
  context: RequestContext;
}

async function loadContext(bookId: string): Promise<SearchContext | { ok: false; error: string }> {
  let context: RequestContext;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return { ok: false, error: "No se ha podido validar la solicitud." };
  }

  const session = await getSession();

  if (!session) {
    return { ok: false, error: "Inicia sesión para continuar." };
  }

  if (!canPerform(session.workspace.role, "section:update")) {
    return { ok: false, error: "No tienes permisos para editar el manuscrito." };
  }

  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true },
  });

  if (!book) {
    return { ok: false, error: "El libro no existe en este espacio de trabajo." };
  }

  return { session, book, context };
}

function isFailure(
  value: SearchContext | { ok: false; error: string },
): value is { ok: false; error: string } {
  return "ok" in value;
}

/** Busca en todas las secciones del libro sin modificar nada. */
export async function searchBook(
  bookId: string,
  options: z.infer<typeof optionsSchema>,
): Promise<SearchBookResponse> {
  const loaded = await loadContext(bookId);

  if (isFailure(loaded)) {
    return { ok: false, error: loaded.error };
  }

  const parsed = optionsSchema.safeParse(options);

  if (!parsed.success) {
    return { ok: false, error: "La búsqueda no es válida." };
  }

  const built = buildSearchPattern(parsed.data);

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const sections = await prisma.bookSection.findMany({
    where: { bookId: loaded.book.id, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, title: true, content: true },
  });

  const results: SearchSectionResult[] = [];
  let total = 0;
  let truncated = false;

  for (const section of sections) {
    let document: TiptapDocument;

    try {
      document = parseTiptapDocument(section.content);
    } catch {
      continue;
    }

    const found = searchDocument(document, built.pattern, {
      maxMatches: Math.max(0, MAX_MATCHES - total),
    });

    if (found.count > 0) {
      total += found.count;
      results.push({
        sectionId: section.id,
        sectionTitle: section.title,
        count: found.count,
        excerpts: found.excerpts,
      });
    }

    if (found.truncated) {
      truncated = true;
      break;
    }
  }

  return { ok: true, total, sections: results, truncated };
}

/**
 * Reemplaza en todas las secciones afectadas.
 *
 * Cada sección se guarda como una revisión manual nueva y con comprobación de
 * versión: si alguien editó una sección mientras se revisaba el resultado, la
 * operación completa se cancela en lugar de pisar su trabajo.
 */
export async function replaceInBook(
  bookId: string,
  options: z.infer<typeof optionsSchema>,
): Promise<ReplaceBookResponse> {
  const loaded = await loadContext(bookId);

  if (isFailure(loaded)) {
    return { ok: false, error: loaded.error };
  }

  const parsed = optionsSchema.safeParse(options);

  if (!parsed.success) {
    return { ok: false, error: "El reemplazo no es válido." };
  }

  const built = buildSearchPattern(parsed.data);

  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const replacement = parsed.data.replacement ?? "";
  const sections = await prisma.bookSection.findMany({
    where: { bookId: loaded.book.id, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, title: true, content: true, version: true },
  });

  const planned: Array<{
    section: (typeof sections)[number];
    document: TiptapDocument;
  }> = [];
  let total = 0;

  for (const section of sections) {
    let document: TiptapDocument;

    try {
      document = parseTiptapDocument(section.content);
    } catch {
      continue;
    }

    const found = searchDocument(document, built.pattern, {
      maxMatches: Math.max(0, MAX_MATCHES - total),
    });

    if (found.count === 0) {
      continue;
    }

    total += found.count;

    if (total > MAX_MATCHES) {
      return {
        ok: false,
        error: `La búsqueda supera las ${MAX_MATCHES} coincidencias. Acota el texto antes de reemplazar.`,
      };
    }

    planned.push({ section, document });
  }

  if (planned.length === 0) {
    return { ok: true, sections: 0, replacements: 0 };
  }

  let replacements = 0;

  try {
    await withSerializableRetry(() =>
      prisma.$transaction(async (transaction) => {
        replacements = 0;

        for (const { section, document } of planned) {
          const replaced = replaceDocument(document, built.pattern, replacement, {
            literal: true,
          });
          const wordCount = countWordsInDocument(replaced.document);
          const nextVersion = section.version + 1;

          await transaction.sectionRevision.create({
            data: {
              sectionId: section.id,
              createdById: loaded.session.user.id,
              version: nextVersion,
              content: replaced.document as unknown as Prisma.InputJsonValue,
              wordCount,
              reason: "MANUAL",
              title: section.title,
            },
          });

          const saved = await transaction.bookSection.updateMany({
            where: {
              id: section.id,
              bookId: loaded.book.id,
              version: section.version,
              deletedAt: null,
            },
            data: {
              content: replaced.document as unknown as Prisma.InputJsonValue,
              wordCount,
              version: nextVersion,
            },
          });

          if (saved.count !== 1) {
            throw new Error("SECTION_VERSION_CONFLICT");
          }

          replacements += replaced.replacements;
        }
      }),
    );
  } catch {
    return {
      ok: false,
      error: "Otra persona ha editado una de las secciones. Vuelve a buscar y repite el reemplazo.",
    };
  }

  await writeAuditLog(
    {
      action: "BOOK_SEARCH_REPLACE",
      entityType: "Book",
      entityId: loaded.book.id,
      workspaceId: loaded.session.workspace.id,
      actorId: loaded.session.user.id,
      metadata: {
        query: parsed.data.query,
        replacement,
        regex: false,
        caseSensitive: parsed.data.caseSensitive === true,
        wholeWord: parsed.data.wholeWord === true,
        sections: planned.length,
        replacements,
      },
    },
    loaded.context,
  );

  for (const path of ["", "/edit", "/review"]) revalidatePath(`/books/${loaded.book.id}${path}`);

  return { ok: true, sections: planned.length, replacements };
}
