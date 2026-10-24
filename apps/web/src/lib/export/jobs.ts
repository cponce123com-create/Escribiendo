import "server-only";
import { loadBookMatter } from "@/lib/editorial/book-matter";
import { DEFAULT_DROP_CAP_SETTINGS } from "@/lib/editorial/template-settings";
import { buildLegalPage } from "@escribiendo/templates";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { ExportFormat, ExportStatus } from "@escribiendo/database";
import { exportContext, generateFile, type ExportMetadata } from "./generate";
import { resolveExportJobInput } from "./reproduce";
import { currentSectionSnapshots, loadManuscriptFromSnapshot, manuscriptHash } from "./manuscript";
import { trabajoInterrumpido } from "./job-estado";
import { liberarHuecoDeExportacion, reservarHuecoDeExportacion } from "./slot";
import { getBookCover } from "@/lib/books/covers";

/**
 * Cola de trabajos de exportación.
 *
 * La cola vive en la base de datos y **no hay ningún proceso permanente** que
 * la vacíe: el trabajo se genera en el momento en que se pide o en el de la
 * descarga. Es lo que permite exportar en Render Free sin un worker que
 * consuma el plan.
 *
 * La cola es idempotente: la clave de un trabajo es el formato más la huella
 * del manuscrito, así que pedir dos veces la misma exportación devuelve el
 * mismo trabajo en lugar de generar dos archivos.
 */

export interface ExportJobSummary {
  id: string;
  bookId: string;
  format: ExportFormat;
  status: ExportStatus;
  manuscriptHash: string;
  progress: number;
  errorMessage: string | null;
  metadata: ExportMetadata | null;
  createdAt: Date;
  completedAt: Date | null;
  /** Nombre del archivo que se descargará. */
  fileName: string | null;
}

interface JobRow {
  id: string;
  bookId: string;
  format: ExportFormat;
  status: ExportStatus;
  manuscriptHash: string;
  progress: number;
  errorMessage: string | null;
  resultMetadata: unknown;
  createdAt: Date;
  completedAt: Date | null;
  options: unknown;
}

function toSummary(row: JobRow): ExportJobSummary {
  const options = (row.options ?? {}) as { fileName?: string };
  const metadata = row.resultMetadata as ExportMetadata | null;

  return {
    id: row.id,
    bookId: row.bookId,
    format: row.format,
    status: row.status,
    manuscriptHash: row.manuscriptHash,
    progress: row.progress,
    errorMessage: row.errorMessage,
    metadata: metadata && typeof metadata === "object" ? metadata : null,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    fileName: options.fileName ?? null,
  };
}

const JOB_SELECT = {
  id: true,
  bookId: true,
  format: true,
  status: true,
  manuscriptHash: true,
  progress: true,
  errorMessage: true,
  resultMetadata: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  options: true,
} as const;

/** Trabajos de exportación de un libro, del más reciente al más antiguo. */
export async function listExportJobs(
  session: SessionContext,
  bookId: string,
): Promise<ExportJobSummary[]> {
  const jobs = await prisma.exportJob.findMany({
    where: { bookId, book: { workspaceId: session.workspace.id, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: JOB_SELECT,
  });

  return jobs.map(toSummary);
}

/** Un trabajo de exportación del espacio de trabajo. */
export async function getExportJob(
  session: SessionContext,
  jobId: string,
): Promise<ExportJobSummary | null> {
  const job = await prisma.exportJob.findFirst({
    where: { id: jobId, book: { workspaceId: session.workspace.id, deletedAt: null } },
    select: JOB_SELECT,
  });

  return job ? toSummary(job) : null;
}

/**
 * Pide una exportación.
 *
 * Devuelve el trabajo existente si ya se pidió lo mismo con el mismo
 * manuscrito; en caso contrario, lo crea y lo genera.
 */
export async function requestExport(
  session: SessionContext,
  bookId: string,
  format: ExportFormat,
  dropCaps?: boolean,
): Promise<ExportJobSummary> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true, authorName: true },
  });

  if (!book) {
    throw new Error("El libro no existe en este espacio de trabajo.");
  }

  const snapshots = await currentSectionSnapshots(session, bookId);
  const manuscript = await loadManuscriptFromSnapshot(session, bookId, snapshots);
  const context = await exportContext(session, bookId);
  const cover = await getBookCover(session, bookId);
  const matter = await loadBookMatter(session, bookId, manuscript);
  if (matter?.legal) matter.frozenLegal = buildLegalPage(matter.legal, { mode: matter.legalMode });
  // La configuración de la edición manda. El parámetro explícito solo sirve
  // para reproducir una petición anterior o forzar un estado en pruebas.
  const dropCap = matter?.dropCap ?? DEFAULT_DROP_CAP_SETTINGS;
  const layoutSnapshot = {
    matter,
    profile: context.profile,
    typography: context.typography,
    runningHeadTemplate: context.runningHeadTemplate,
    bookTitle: book.title,
    authorName: book.authorName,
    dropCaps: dropCaps ?? dropCap.enabled,
    dropCapLines: dropCap.lines,
    cover: cover ? { url: cover.url, crop: cover.crop } : null,
  };

  // La huella incluye el formato y la maqueta: cambian el archivo, de modo
  // que tienen que dar lugar a trabajos distintos.
  const hash = manuscriptHash(manuscript, `${format}:${JSON.stringify(layoutSnapshot)}`);
  const idempotencyKey = `${format}:${hash}`.slice(0, 120);

  const existing = await prisma.exportJob.findFirst({
    where: { idempotencyKey, bookId },
    select: JOB_SELECT,
  });

  if (existing && existing.status === "COMPLETED") {
    return toSummary(existing);
  }

  // Un trabajo que se quedó en «procesando» (un despliegue que se cayó a
  // medias, por ejemplo) no se puede volver a pedir: se marca como fallido
  // para que la interfaz no lo muestre como si estuviera en marcha.
  if (existing && trabajoInterrumpido(existing)) {
    await prisma.exportJob.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        progress: 0,
        errorCode: "EXPORT_TIMEOUT",
        errorMessage: "La generación se interrumpió y hay que volver a pedirla.",
        completedAt: new Date(),
      },
      select: JOB_SELECT,
    });
  }

  const job =
    existing ??
    (await prisma.exportJob.create({
      data: {
        bookId,
        requestedById: session.user.id,
        format,
        status: "PENDING",
        idempotencyKey,
        manuscriptHash: hash,
        sectionVersions: snapshots as unknown as object,
        options: { layout: layoutSnapshot } as unknown as object,
      },
      select: JOB_SELECT,
    }));

  return processExportJob(session, job.id);
}

/**
 * Genera el archivo del trabajo y guarda sus metadatos.
 *
 * La generación es reproducible: usa las versiones de las secciones que
 * guardó el trabajo, de modo que el archivo es el mismo aunque el manuscrito
 * haya cambiado después.
 */
export async function processExportJob(
  session: SessionContext,
  jobId: string,
): Promise<ExportJobSummary> {
  // Una exportación cada vez por instancia: dos a la vez dejarían a Render
  // Free sin memoria.
  if (!reservarHuecoDeExportacion()) {
    throw new Error(
      "Ya hay una exportación en marcha en este estudio. Espera a que termine antes de pedir otra.",
    );
  }

  try {
    return await generarExportJob(session, jobId);
  } finally {
    liberarHuecoDeExportacion();
  }
}

/**
 * Genera el archivo del trabajo y guarda sus metadatos.
 *
 * La generación es reproducible: usa la instantánea editorial que guardó el
 * trabajo (secciones, maquetación y portada), de modo que el archivo es el
 * mismo aunque el libro haya cambiado después.
 */
async function generarExportJob(session: SessionContext, jobId: string): Promise<ExportJobSummary> {
  const job = await prisma.exportJob.findFirst({
    where: { id: jobId, book: { workspaceId: session.workspace.id, deletedAt: null } },
    select: {
      ...JOB_SELECT,
      sectionVersions: true,
      editionId: true,
    },
  });

  if (!job) {
    throw new Error("El trabajo de exportación no existe.");
  }

  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING", startedAt: new Date(), progress: 10, errorMessage: null },
  });

  try {
    const input = await resolveExportJobInput(session, job);
    const file = await generateFile(input);

    const updated = await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        progress: 100,
        completedAt: new Date(),
        resultMetadata: file.metadata as unknown as object,
        options: {
          ...(job.options && typeof job.options === "object" ? job.options : {}),
          fileName: file.fileName,
          mimeType: file.mimeType,
        },
        errorCode: null,
        errorMessage: null,
      },
      select: JOB_SELECT,
    });

    return toSummary(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se ha podido generar el archivo.";

    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        progress: 0,
        errorCode: "EXPORT_FAILED",
        errorMessage: message.slice(0, 2_000),
        completedAt: new Date(),
      },
      select: JOB_SELECT,
    });

    throw error;
  }
}
