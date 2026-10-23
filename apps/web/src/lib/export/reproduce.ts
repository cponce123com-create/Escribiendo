import "server-only";
import type { ExportFormat } from "@escribiendo/database";
import type { SessionContext } from "@/lib/auth/session";
import { getBookCover } from "@/lib/books/covers";
import { loadBookMatter } from "@/lib/editorial/book-matter";
import { prisma } from "@/lib/db";
import { exportContext, type GenerateInput } from "./generate";
import { readExportLayoutSnapshot } from "./layout-snapshot";
import { loadManuscriptForJob } from "./manuscript";

/** Datos mínimos de un trabajo que hacen falta para reproducirlo. */
export interface ExportJobRecord {
  bookId: string;
  format: ExportFormat;
  sectionVersions: unknown;
  options: unknown;
  createdAt: Date;
}

/**
 * Reconstruye la entrada exacta de una exportación.
 *
 * Tanto la generación inicial como la descarga pasan por aquí: así el archivo
 * descargado coincide con el que se generó, aunque el libro, la portada o la
 * plantilla hayan cambiado después. La instantánea guardada manda; los datos
 * actuales solo se usan para los trabajos anteriores a ella.
 */
export async function resolveExportJobInput(
  session: SessionContext,
  job: ExportJobRecord,
): Promise<GenerateInput> {
  const book = await prisma.book.findFirst({
    where: { id: job.bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true, authorName: true },
  });

  if (!book) {
    throw new Error("El libro no existe en este espacio de trabajo.");
  }

  const snapshot = readExportLayoutSnapshot(job.options);
  const sections = await loadManuscriptForJob(session, job.bookId, job.sectionVersions);

  const needsCurrentContext = snapshot === null;
  const needsCurrentCover = snapshot === null || !snapshot.hasCoverSnapshot;

  const context = needsCurrentContext ? await exportContext(session, job.bookId) : null;
  const currentCover = needsCurrentCover ? await getBookCover(session, job.bookId) : null;

  const cover = snapshot?.hasCoverSnapshot
    ? snapshot.cover
    : currentCover
      ? { url: currentCover.url, crop: currentCover.crop }
      : null;

  const title = snapshot?.bookTitle || book.title;
  const author = snapshot?.authorName || book.authorName;
  const matter = await loadBookMatter(session, job.bookId, sections);

  return {
    format: job.format,
    title,
    author,
    sections,
    matter,
    profile: snapshot ? snapshot.profile : (context?.profile ?? null),
    typography: snapshot ? snapshot.typography : (context?.typography ?? {}),
    runningHeadTemplate: snapshot
      ? snapshot.runningHeadTemplate
      : (context?.runningHeadTemplate ?? null),
    bookTitle: title,
    dropCaps: snapshot?.dropCaps ?? false,
    cover: cover ? { src: cover.url, alt: `Portada de ${title}`, crop: cover.crop } : undefined,
    createdAt: job.createdAt,
  };
}
