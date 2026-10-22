import type { PdfLayoutProfile } from "./pdf-layout";
import type { RunningHeadTemplate } from "@/lib/layout/running-heads";

/** Datos de maquetación que fijan la apariencia de una exportación. */
export interface ExportLayoutSnapshot {
  profile: PdfLayoutProfile | null;
  typography: unknown;
  runningHeadTemplate: RunningHeadTemplate | null;
  bookTitle: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  return {
    profile: layout.profile as PdfLayoutProfile | null,
    typography: layout.typography,
    runningHeadTemplate,
    bookTitle: typeof layout.bookTitle === "string" ? layout.bookTitle : "",
  };
}
