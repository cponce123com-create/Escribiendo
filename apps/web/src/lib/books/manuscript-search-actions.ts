"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseTiptapDocument, countWordsInDocument, CHAPTER_LIKE_SECTION_TYPES } from "@escribiendo/book-schema";
import type { Prisma, RevisionReason } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { assertCanPerform } from "./permissions";
import { computeWritingProgress } from "./progress";
import { excerptForQuery, findTextMatches, replaceTextLeaves, type ManuscriptMatch } from "./manuscript-search";

export async function searchBookManuscriptAction(bookId: string, query: string): Promise<ManuscriptMatch[]> {
  const session = await getSession();
  if (!session) redirect("/login");
  const needle = query.trim().slice(0, 120);
  if (!needle) return [];

  const sections = await prisma.bookSection.findMany({
    where: { bookId, deletedAt: null, book: { workspaceId: session.workspace.id, deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, content: true },
  });

  return sections.flatMap((section) => {
    const count = findTextMatches(section.content, needle);
    return count ? [{ sectionId: section.id, sectionTitle: section.title, count, excerpt: excerptForQuery(section.content, needle) }] : [];
  });
}

export async function replaceBookManuscriptAction(
  bookId: string,
  search: string,
  replacement: string,
): Promise<{ count: number; error?: string }> {
  try {
    await assertServerActionOrigin();
  } catch {
    return { count: 0, error: "No se ha podido validar la solicitud." };
  }
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return { count: 0, error: "No tienes permisos para editar este manuscrito." };
  }
  const needle = search.trim().slice(0, 120);
  if (!needle) return { count: 0, error: "Escribe una palabra o frase para reemplazar." };
  if (needle.toLocaleLowerCase("es") === replacement.toLocaleLowerCase("es")) return { count: 0 };

  const sections = await prisma.bookSection.findMany({
    where: { bookId, deletedAt: null, book: { workspaceId: session.workspace.id, deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, version: true, content: true },
  });
  if (!sections.length) return { count: 0, error: "El libro no est� disponible." };

  const prepared = sections.flatMap((section) => {
    const document = parseTiptapDocument(section.content);
    const result = replaceTextLeaves(document, needle, replacement);
    return result.count ? [{ section, document: result.document, count: result.count }] : [];
  });
  const total = prepared.reduce((sum, item) => sum + item.count, 0);
  if (!total) return { count: 0 };

  try {
    await prisma.$transaction(async (transaction) => {
      for (const item of prepared) {
        const nextVersion = item.section.version + 1;
        const wordCount = countWordsInDocument(item.document);
        await transaction.sectionRevision.create({
          data: {
            sectionId: item.section.id,
            createdById: session.user.id,
            version: nextVersion,
            content: item.document as unknown as Prisma.InputJsonValue,
            wordCount,
            reason: "MANUAL" satisfies RevisionReason,
            title: item.section.title,
          },
        });
        const saved = await transaction.bookSection.updateMany({
          where: { id: item.section.id, version: item.section.version, deletedAt: null },
          data: {
            content: item.document as unknown as Prisma.InputJsonValue,
            wordCount,
            version: nextVersion,
          },
        });
        if (saved.count !== 1) throw new Error("SECTION_VERSION_CONFLICT");
      }
    });
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error && error.message === "SECTION_VERSION_CONFLICT"
        ? "El manuscrito cambi� mientras se aplicaba el reemplazo. No se modific� ninguna secci�n; recarga y vuelve a intentarlo."
        : "No se pudo completar el reemplazo. No se modific� ninguna secci�n; vuelve a intentarlo.",
    };
  }
  for (const item of prepared) revalidatePath(`/books/${bookId}/sections/${item.section.id}`);

  const [aggregate, chapters, book] = await Promise.all([
    prisma.bookSection.aggregate({ where: { bookId, deletedAt: null }, _sum: { wordCount: true } }),
    prisma.bookSection.count({ where: { bookId, deletedAt: null, type: { in: [...CHAPTER_LIKE_SECTION_TYPES] } } }),
    prisma.book.findFirst({ where: { id: bookId, workspaceId: session.workspace.id }, select: { targetWordCount: true } }),
  ]);
  const wordCount = aggregate._sum.wordCount ?? 0;
  if (book) await prisma.book.update({
    where: { id: bookId },
    data: { wordCount, chapterCount: chapters, writingProgress: computeWritingProgress(wordCount, book.targetWordCount) },
  });
  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/preview`);
  revalidatePath(`/books/${bookId}/export`);
  return { count: total };
}
