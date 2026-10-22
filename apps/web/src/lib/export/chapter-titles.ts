import type { ExportBlock, ExportChapter } from "@escribiendo/export-engine";
import { isChapterType, repeatsSectionTitle, sectionShowsTitle } from "@/lib/layout/blocks";
import type { ManuscriptBlock } from "./manuscript";

export interface SectionTitleInput {
  id: string;
  title: string;
  type: string;
}

/** Prepara los capítulos reflowables con título y sin encabezados duplicados. */
export function chaptersForReflowableFormats(
  sections: readonly SectionTitleInput[],
  sectionBlocks: readonly ManuscriptBlock[][],
  dropCaps = false,
): ExportChapter[] {
  return sections.map((section, index) => {
    const sourceBlocks = sectionBlocks[index] ?? [];
    const showSectionTitle = sectionShowsTitle(section.type, section.title);
    const repeatsTitle = showSectionTitle && repeatsSectionTitle(sourceBlocks, section.title);
    const isSubchapter = section.type.toUpperCase() === "SUBCHAPTER";
    const blocks: ExportBlock[] = (repeatsTitle ? sourceBlocks.slice(1) : sourceBlocks).map(
      (block) => ({
        kind: block.kind,
        text: block.text,
        ...(block.runs ? { runs: block.runs } : {}),
        ...(block.image ? { image: block.image } : {}),
      }),
    );

    if (showSectionTitle && isSubchapter) {
      blocks.unshift({ kind: "heading", text: section.title.trim() });
    }

    return {
      id: section.id,
      title: section.title,
      showTitle: showSectionTitle && !isSubchapter,
      dropCap: dropCaps && isChapterType(section.type) && !isSubchapter,
      blocks,
    };
  });
}
