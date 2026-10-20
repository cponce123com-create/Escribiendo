import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";

/**
 * Comentarios editoriales.
 *
 * A diferencia de las notas, son visibles para todo el espacio de trabajo:
 * sirven para que la edición se comunique con la autoría. Cada comentario
 * se ancla a un libro y, opcionalmente, a una sección.
 */

export interface EditorialCommentSummary {
  id: string;
  body: string;
  status: "OPEN" | "RESOLVED";
  sectionId: string | null;
  sectionTitle: string | null;
  author: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface CommentFilters {
  bookId: string;
  sectionId?: string;
  onlyOpen?: boolean;
}

/** Comentarios de un libro, primero los abiertos. */
export async function listComments(
  session: SessionContext,
  filters: CommentFilters,
): Promise<EditorialCommentSummary[]> {
  const comments = await prisma.editorialComment.findMany({
    where: {
      bookId: filters.bookId,
      deletedAt: null,
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.onlyOpen ? { status: "OPEN" } : {}),
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      body: true,
      status: true,
      sectionId: true,
      createdAt: true,
      resolvedAt: true,
      author: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
      section: { select: { title: true } },
    },
  });

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    status: comment.status,
    sectionId: comment.sectionId,
    sectionTitle: comment.section?.title ?? null,
    author: comment.author,
    resolvedBy: comment.resolvedBy,
    createdAt: comment.createdAt,
    resolvedAt: comment.resolvedAt,
  }));
}

/** Número de comentarios sin resolver de un libro. */
export async function countOpenComments(session: SessionContext, bookId: string): Promise<number> {
  return prisma.editorialComment.count({
    where: {
      bookId,
      status: "OPEN",
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
  });
}

/** Comentarios de una sección concreta. */
export async function listSectionComments(
  session: SessionContext,
  bookId: string,
  sectionId: string,
): Promise<EditorialCommentSummary[]> {
  return listComments(session, { bookId, sectionId });
}
