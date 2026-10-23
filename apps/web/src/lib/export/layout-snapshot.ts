import type { BookMatter } from "@/lib/editorial/book-matter";
import type { PdfLayoutProfile } from "./pdf-layout";
import type { RunningHeadTemplate } from "@/lib/layout/running-heads";
import type { CoverCrop } from "@/lib/books/cover-shared";

/** Portada que se capturó al pedir la exportación. */
export interface ExportCoverSnapshot {
  url: string;
  crop: CoverCrop;
}

/** Datos de maquetación que fijan la apariencia de una exportación. */
export interface ExportLayoutSnapshot {
  matter?: BookMatter | null;
  profile: PdfLayoutProfile | null;
  typography: unknown;
  runningHeadTemplate: RunningHeadTemplate | null;
  bookTitle: string;
  authorName: string;
  dropCaps: boolean;
  cover: ExportCoverSnapshot | null;
  /**
   * Indica si la instantánea capturó la portada, aunque fuera nula.
   *
   * Los trabajos antiguos no tienen esta marca: entonces se usa la portada
   * actual, que es lo que hacían antes de existir la instantánea.
   */
  hasCoverSnapshot: boolean;
}

const DEFAULT_CROP: CoverCrop = { x: 50, y: 50, zoom: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" ? Math.min(max, Math.max(min, value)) : fallback;
}

function readCoverCrop(value: unknown): CoverCrop {
  if (!isRecord(value)) {
    return DEFAULT_CROP;
  }

  return {
    x: numberInRange(value.x, 0, 100, DEFAULT_CROP.x),
    y: numberInRange(value.y, 0, 100, DEFAULT_CROP.y),
    zoom: numberInRange(value.zoom, 1, 3, DEFAULT_CROP.zoom),
  };
}

function readCover(value: unknown): ExportCoverSnapshot | null {
  if (!isRecord(value) || typeof value.url !== "string" || value.url.length === 0) {
    return null;
  }

  return { url: value.url, crop: readCoverCrop(value.crop) };
}

/** Lee la instantánea guardada en un trabajo; los trabajos antiguos no la tienen. */
export function readExportLayoutSnapshot(options: unknown): ExportLayoutSnapshot | null {
  if (!isRecord(options) || !isRecord(options.layout)) {
    return null;
  }

  const layout = options.layout;
  const rawTemplate = layout.runningHeadTemplate;

  if (layout.profile !== null && !isRecord(layout.profile)) {
    return null;
  }

  let runningHeadTemplate: RunningHeadTemplate | null = null;

  if (rawTemplate !== null && rawTemplate !== undefined) {
    if (!isRecord(rawTemplate) || !isRecord(rawTemplate.runningHead)) {
      return null;
    }

    const { recto, verso } = rawTemplate.runningHead;

    if (typeof recto !== "string" || typeof verso !== "string") {
      return null;
    }

    runningHeadTemplate = { runningHead: { recto, verso } };
  }

  if (!("typography" in layout) || !("profile" in layout)) {
    return null;
  }

  // La presencia de la clave —aunque valga `null`— distingue «el libro no
  // tenía portada al pedir el trabajo» de «la instantánea es antigua».
  const hasCoverSnapshot = "cover" in layout;

  return {
    ...("matter" in layout ? { matter: layout.matter as BookMatter | null } : {}),
    profile: layout.profile as PdfLayoutProfile | null,
    typography: layout.typography,
    runningHeadTemplate,
    bookTitle: typeof layout.bookTitle === "string" ? layout.bookTitle : "",
    authorName: typeof layout.authorName === "string" ? layout.authorName : "",
    dropCaps: layout.dropCaps === true,
    cover: hasCoverSnapshot ? readCover(layout.cover) : null,
    hasCoverSnapshot,
  };
}
