import "server-only";
import type { BookStatus, Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { buildSectionTree, type SectionNode } from "./section-tree";
import { getBookCovers, type BookCoverSummary } from "./covers";

/**
 * Lecturas de la biblioteca.
 *
 * Toda consulta incluye `workspaceId` de la sesión. El rol se comprueba en
 * las acciones de escritura; aquí la restricción de espacio de trabajo es
 * suficiente para no filtrar manuscritos entre estudios.
 */

export type BookSort = "recent" | "title" | "words";

export interface BookListFilters {
  search?: string;
  status?: BookStatus;
  sort?: BookSort;
}

export interface BookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  authorName: string;
  penName: string | null;
  status: BookStatus;
  genre: string | null;
  language: string;
  targetWordCount: number | null;
  wordCount: number;
  chapterCount: number;
  writingProgress: number;
  updatedAt: Date;
  createdAt: Date;
  sectionCount: number;
  cover: BookCoverSummary | null;
}

function orderBy(sort: BookSort): Prisma.BookOrderByWithRelationInput[] {
  switch (sort) {
    case "title":
      return [{ title: "asc" }];
    case "words":
      return [{ wordCount: "desc" }, { title: "asc" }];
    case "recent":
    default:
      return [{ updatedAt: "desc" }];
  }
}

/** Lista los libros del espacio de trabajo con búsqueda y filtros. */
export async function listBooks(
  session: SessionContext,
  filters: BookListFilters = {},
): Promise<BookListItem[]> {
  const search = filters.search?.trim();
  const where: Prisma.BookWhereInput = {
    workspaceId: session.workspace.id,
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { subtitle: { contains: search, mode: "insensitive" } },
            { authorName: { contains: search, mode: "insensitive" } },
            { penName: { contains: search, mode: "insensitive" } },
            { genre: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const books = await prisma.book.findMany({
    where,
    orderBy: orderBy(filters.sort ?? "recent"),
    select: {
      id: true,
      title: true,
      subtitle: true,
      authorName: true,
      penName: true,
      status: true,
      genre: true,
      language: true,
      targetWordCount: true,
      wordCount: true,
      chapterCount: true,
      writingProgress: true,
      updatedAt: true,
      createdAt: true,
      _count: { select: { sections: { where: { deletedAt: null } } } },
    },
  });

  const covers = await getBookCovers(session, books.map((book) => book.id));

  return books.map((book) => ({
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    authorName: book.authorName,
    penName: book.penName,
    status: book.status,
    genre: book.genre,
    language: book.language,
    targetWordCount: book.targetWordCount,
    wordCount: book.wordCount,
    chapterCount: book.chapterCount,
    writingProgress: Number(book.writingProgress),
    updatedAt: book.updatedAt,
    createdAt: book.createdAt,
    sectionCount: book._count.sections,
    cover: covers.get(book.id) ?? null,
  }));
}

/** Número total de libros del espacio de trabajo, sin filtros. */
export async function countBooks(session: SessionContext): Promise<number> {
  return prisma.book.count({
    where: { workspaceId: session.workspace.id, deletedAt: null },
  });
}

export interface BookDetail {
  id: string;
  title: string;
  subtitle: string | null;
  authorName: string;
  penName: string | null;
  description: string | null;
  genre: string | null;
  language: string;
  status: BookStatus;
  targetWordCount: number | null;
  wordCount: number;
  chapterCount: number;
  writingProgress: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string };
  cover: BookCoverSummary | null;
}

/** Ficha de un libro, o `null` si no existe en este espacio de trabajo. */
export async function getBook(session: SessionContext, bookId: string): Promise<BookDetail | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      subtitle: true,
      authorName: true,
      penName: true,
      description: true,
      genre: true,
      language: true,
      status: true,
      targetWordCount: true,
      wordCount: true,
      chapterCount: true,
      writingProgress: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!book) {
    return null;
  }

  const cover = await getBookCovers(session, [book.id]);
  return { ...book, writingProgress: Number(book.writingProgress), cover: cover.get(book.id) ?? null };
}

/** Árbol de secciones de un libro. */
export async function getSectionTree(
  session: SessionContext,
  bookId: string,
): Promise<SectionNode[]> {
  const rows = await prisma.bookSection.findMany({
    where: { bookId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      parentId: true,
      type: true,
      title: true,
      sortOrder: true,
      wordCount: true,
      version: true,
    },
  });

  return buildSectionTree(rows);
}

export interface SectionDetail {
  id: string;
  bookId: string;
  parentId: string | null;
  type: string;
  title: string;
  content: unknown;
  wordCount: number;
  version: number;
  sortOrder: number;
  showInToc: boolean;
  showTitle: boolean;
  showSectionType: boolean;
  showSectionNumber: boolean;
  includeInExport: boolean;
  pageBreakBefore: boolean;
  startOnOddPage: boolean;
  /** Persona a la que se ha asignado el trabajo de la secci\u00f3n. */
  assigneeId: string | null;
  assignee: { name: string } | null;
  updatedAt: Date;
}

/**
 * Una sección del libro indicado.
 *
 * La pertenencia al espacio de trabajo se comprueba a través del libro: una
 * sección de otro estudio no es accesible aunque se conozca su identificador.
 */
export async function getSection(
  session: SessionContext,
  bookId: string,
  sectionId: string,
): Promise<SectionDetail | null> {
  const section = await prisma.bookSection.findFirst({
    where: {
      id: sectionId,
      // La sección tiene que ser del libro de la dirección: si no, se abriría
      // el contenido de un libro bajo la cabecera de otro.
      bookId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: {
      id: true,
      bookId: true,
      parentId: true,
      type: true,
      title: true,
      content: true,
      wordCount: true,
      version: true,
      sortOrder: true,
      showInToc: true,
      showTitle: true,
      showSectionType: true,
      showSectionNumber: true,
      includeInExport: true,
      pageBreakBefore: true,
      startOnOddPage: true,
      assigneeId: true,
      assignee: { select: { name: true } },
      updatedAt: true,
    },
  });

  return section;
}

export interface RevisionSummary {
  id: string;
  version: number;
  reason: string;
  wordCount: number;
  createdAt: Date;
  createdBy: { id: string; name: string };
}

/** Historial de revisiones de una sección, de la más reciente a la más antigua. */
export async function listRevisions(
  session: SessionContext,
  bookId: string,
  sectionId: string,
  limit = 20,
): Promise<RevisionSummary[]> {
  const revisions = await prisma.sectionRevision.findMany({
    where: {
      sectionId,
      section: {
        deletedAt: null,
        // La sección tiene que ser del libro de la dirección.
        book: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
      },
    },
    orderBy: { version: "desc" },
    take: limit,
    select: {
      id: true,
      version: true,
      reason: true,
      wordCount: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return revisions;
}

/** Contenido de una revisión concreta, para restaurarla o compararla. */
export async function getRevisionContent(
  session: SessionContext,
  bookId: string,
  revisionId: string,
): Promise<{ id: string; version: number; content: unknown } | null> {
  const revision = await prisma.sectionRevision.findFirst({
    where: {
      id: revisionId,
      section: {
        deletedAt: null,
        // La revisión tiene que ser de una sección del libro de la dirección.
        book: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
      },
    },
    select: { id: true, version: true, content: true },
  });

  return revision;
}
