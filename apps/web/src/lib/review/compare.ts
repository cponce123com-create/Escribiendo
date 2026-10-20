import "server-only";
import {
  extractPlainText,
  parseTiptapDocument,
  diffWords,
  summarizeDiff,
} from "@escribiendo/book-schema";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";

/**
 * Comparación de dos revisiones de una sección.
 *
 * El diff se calcula en el servidor: el cliente solo recibe los segmentos ya
 * comparados y no carga el texto completo de dos versiones del manuscrito.
 */

export interface RevisionRef {
  id: string;
  version: number;
  wordCount: number;
  reason: string;
  createdAt: Date;
  author: { id: string; name: string };
}

export interface RevisionComparison {
  from: RevisionRef;
  to: RevisionRef;
  segments: ReturnType<typeof diffWords>;
  summary: ReturnType<typeof summarizeDiff>;
}

/** Revisiones de una sección, de la más reciente a la más antigua. */
export async function listSectionRevisions(
  session: SessionContext,
  bookId: string,
  sectionId: string,
): Promise<RevisionRef[]> {
  const revisions = await prisma.sectionRevision.findMany({
    where: {
      sectionId,
      section: {
        deletedAt: null,
        book: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
      },
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      wordCount: true,
      reason: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return revisions.map((revision) => ({
    id: revision.id,
    version: revision.version,
    wordCount: revision.wordCount,
    reason: revision.reason,
    createdAt: revision.createdAt,
    author: revision.createdBy,
  }));
}

/**
 * Compara dos revisiones concretas.
 *
 * Devuelve `null` si alguna de las dos no pertenece a la sección o al
 * espacio de trabajo.
 */
export async function compareRevisions(
  session: SessionContext,
  bookId: string,
  sectionId: string,
  fromId: string,
  toId: string,
): Promise<RevisionComparison | null> {
  const revisions = await prisma.sectionRevision.findMany({
    where: {
      id: { in: [fromId, toId] },
      sectionId,
      section: {
        deletedAt: null,
        book: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
      },
    },
    select: {
      id: true,
      version: true,
      wordCount: true,
      reason: true,
      createdAt: true,
      content: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  const from = revisions.find((revision) => revision.id === fromId);
  const to = revisions.find((revision) => revision.id === toId);

  if (!from || !to) {
    return null;
  }

  const fromText = extractPlainText(parseTiptapDocument(from.content));
  const toText = extractPlainText(parseTiptapDocument(to.content));
  const segments = diffWords(fromText, toText);

  return {
    from: {
      id: from.id,
      version: from.version,
      wordCount: from.wordCount,
      reason: from.reason,
      createdAt: from.createdAt,
      author: from.createdBy,
    },
    to: {
      id: to.id,
      version: to.version,
      wordCount: to.wordCount,
      reason: to.reason,
      createdAt: to.createdAt,
      author: to.createdBy,
    },
    segments,
    summary: summarizeDiff(segments),
  };
}
