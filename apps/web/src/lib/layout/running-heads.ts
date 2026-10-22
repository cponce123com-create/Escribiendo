import type { LaidOutPage } from "@escribiendo/editorial-engine";
import type { EditorialTemplateConfig } from "@escribiendo/templates";

/** Plantilla de encabezados que se puede aplicar a una página compuesta. */
export type RunningHeadTemplate = Pick<EditorialTemplateConfig, "runningHead">;

/**
 * Resuelve el encabezado de cada página para la vista previa y el PDF.
 * Las páginas en blanco y las que abren capítulo quedan sin encabezado.
 */
export function resolveRunningHeads(
  pages: readonly LaidOutPage[],
  template: RunningHeadTemplate | null | undefined,
  bookTitle: string,
): LaidOutPage[] {
  return pages.map((page) => {
    const abreCapitulo = page.blocks[0]?.startsChapter === true;

    if (page.blank || abreCapitulo) {
      return { ...page, runningHead: null };
    }

    const chapterTitle = page.blocks.find((block) => block.sectionTitle)?.sectionTitle ?? "";
    const templateText = template?.runningHead[page.side] ?? "";
    const text = templateText.trim()
      ? templateText.replaceAll("{libro}", bookTitle).replaceAll("{capitulo}", chapterTitle).trim()
      : chapterTitle.trim();

    return { ...page, runningHead: text || null };
  });
}
