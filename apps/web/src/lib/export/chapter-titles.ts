import type { ExportBlock, ExportChapter } from "@escribiendo/export-engine";
import { isChapterType, repeatsSectionTitle, sectionShowsTitle } from "@/lib/layout/blocks";
import { composeSectionTitle } from "@/lib/layout/section-title";
import type { ManuscriptBlock } from "./manuscript";

export interface SectionTitleInput {
  id: string;
  title: string;
  type: string;
  /** El título editorial se muestra en el cuerpo. */
  showTitle?: boolean;
  /** El título se acompaña con la etiqueta del tipo. */
  showSectionType?: boolean;
  /** El título se acompaña con el número correlativo. */
  showSectionNumber?: boolean;
}

/** Prepara los capítulos reflowables con título y sin encabezados duplicados. */
export function chaptersForReflowableFormats(
  sections: readonly SectionTitleInput[],
  sectionBlocks: readonly ManuscriptBlock[][],
  dropCaps = false,
): ExportChapter[] {
  // Contador correlativo por tipo, igual que en la vista previa y el PDF: los
  // prólogos no numeran capítulos y cada formato cuenta lo mismo.
  const counters = new Map<string, number>();

  return sections.map((section, index) => {
    const sourceBlocks = sectionBlocks[index] ?? [];
    const conventionallyShows = sectionShowsTitle(section.type, section.title);
    const countable = section.type === "CHAPTER" || section.type === "PART";
    const next = countable ? (counters.get(section.type) ?? 0) + 1 : undefined;

    if (countable && next !== undefined) {
      counters.set(section.type, next);
    }

    // Mismo título visible que componen la vista previa y el PDF. Un tipo que
    // por convención no presenta título (cubierta, dedicatoria) nunca lo
    // muestra, decida lo que el autor.
    const composedTitle = conventionallyShows
      ? composeSectionTitle(
          {
            id: section.id,
            title: section.title,
            type: section.type,
            showTitle: section.showTitle ?? true,
            showSectionType: section.showSectionType ?? false,
            showSectionNumber: section.showSectionNumber ?? false,
          },
          next,
        )
      : null;
    const visibleTitle = composedTitle ?? section.title;
    const showTitle = composedTitle !== null;
    const repeatsTitle =
      showTitle &&
      (repeatsSectionTitle(sourceBlocks, composedTitle ?? "") ||
        repeatsSectionTitle(sourceBlocks, section.title));
    const isSubchapter = section.type.toUpperCase() === "SUBCHAPTER";
    const blocks: ExportBlock[] = (repeatsTitle ? sourceBlocks.slice(1) : sourceBlocks).map(
      (block) => ({
        kind: block.kind,
        text: block.text,
        ...(block.runs ? { runs: block.runs } : {}),
        ...(block.image ? { image: block.image } : {}),
      }),
    );

    // Un subcapítulo no lleva el título compuesto como capítulo: se convierte
    // en un encabezado del cuerpo, a nivel 2, para no romper la jerarquía.
    if (showTitle && isSubchapter) {
      blocks.unshift({ kind: "heading", text: visibleTitle.trim() });
    }

    return {
      id: section.id,
      title: visibleTitle,
      showTitle: showTitle && !isSubchapter,
      dropCap: dropCaps && isChapterType(section.type) && !isSubchapter,
      blocks,
    };
  });
}
