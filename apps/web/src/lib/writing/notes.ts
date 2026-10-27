import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";

/**
 * Notas privadas de escritura.
 *
 * Una nota pertenece a una persona y a un libro, y opcionalmente a una
 * sección. Solo su autora puede leerla: la consulta filtra siempre por
 * `userId`, además de por el espacio de trabajo.
 */

export interface NoteSummary {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  sectionId: string | null;
  sectionTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Notas de un libro para su autora, fijadas primero. */
export async function listBookNotes(
  session: SessionContext,
  bookId: string,
  sectionId?: string,
): Promise<NoteSummary[]> {
  const notes = await prisma.writingNote.findMany({
    where: {
      bookId,
      userId: session.user.id,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
      // El inspector de una sección muestra sus notas y las del libro; filtrar
      // aquí evita traer el cuaderno entero en cada cambio de capítulo.
      ...(sectionId ? { OR: [{ sectionId }, { sectionId: null }] } : {}),
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      content: true,
      isPinned: true,
      sectionId: true,
      createdAt: true,
      updatedAt: true,
      section: { select: { title: true } },
    },
  });

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    isPinned: note.isPinned,
    sectionId: note.sectionId,
    sectionTitle: note.section?.title ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));
}

/** Todas las notas de la autora en el espacio de trabajo. */
export async function listAllNotes(
  session: SessionContext,
): Promise<Array<NoteSummary & { bookId: string; bookTitle: string }>> {
  const notes = await prisma.writingNote.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      content: true,
      isPinned: true,
      sectionId: true,
      createdAt: true,
      updatedAt: true,
      bookId: true,
      book: { select: { title: true } },
      section: { select: { title: true } },
    },
  });

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    isPinned: note.isPinned,
    sectionId: note.sectionId,
    sectionTitle: note.section?.title ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    bookId: note.bookId,
    bookTitle: note.book.title,
  }));
}

/** Número de notas de un libro. */
export async function countBookNotes(session: SessionContext, bookId: string): Promise<number> {
  return prisma.writingNote.count({
    where: {
      bookId,
      userId: session.user.id,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
  });
}
