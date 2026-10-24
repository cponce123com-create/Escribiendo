import { CHAPTER_LIKE_SECTION_TYPES, type BookSectionType } from "@escribiendo/book-schema";
import type { RhythmChapterInput, TiptapTextBlock } from "@escribiendo/book-schema";
import type { SectionNode } from "./section-tree";

const CHAPTER_ROOT_TYPES = new Set<string>([
  "CHAPTER",
  "INTRODUCTION",
  "PROLOGUE",
  "INTERLUDE",
  "EPILOGUE",
]);

/**
 * Asigna cada sección narrativa a su capítulo raíz. Los subcapítulos heredan
 * el capítulo contenedor; prólogos, interludios, introducciones y epílogos se
 * consideran unidades propias para comparar el texto sin mezclar capítulos.
 */
export function mapEditorialSectionsToChapters(nodes: readonly SectionNode[]): Map<string, string> {
  const result = new Map<string, string>();

  const visit = (siblings: readonly SectionNode[], parentChapterId: string | null): void => {
    for (const node of siblings) {
      let chapterId = parentChapterId;

      if (CHAPTER_ROOT_TYPES.has(node.type)) {
        chapterId = node.id;
      } else if (node.type === "PART" && !chapterId) {
        // El texto propio de una parte no se mezcla con las partes siguientes.
        chapterId = node.id;
      } else if (node.type === "SUBCHAPTER" && !chapterId) {
        chapterId = node.id;
      }

      if (CHAPTER_LIKE_SECTION_TYPES.has(node.type as BookSectionType)) {
        result.set(node.id, chapterId ?? node.id);
      }

      visit(node.children, chapterId);
    }
  };

  visit(nodes, null);
  return result;
}

export interface EditorialRhythmSection {
  id: string;
  title: string;
  version: number;
  contentHash: string;
  blocks: readonly TiptapTextBlock[];
}

/** Combina bloques de subcapítulos en el capítulo raíz con offsets sintéticos únicos. */
export function buildRhythmChapterInputs(
  sections: readonly EditorialRhythmSection[],
  chapterBySection: ReadonlyMap<string, string>,
): RhythmChapterInput[] {
  const groups = new Map<string, EditorialRhythmSection[]>();
  for (const section of sections) {
    const chapterId = chapterBySection.get(section.id) ?? section.id;
    const group = groups.get(chapterId) ?? [];
    group.push(section);
    groups.set(chapterId, group);
  }

  return [...groups].map(([chapterId, members]) => {
    let offsetBase = 0;
    let paragraphBase = 0;
    const blocks: TiptapTextBlock[] = [];

    for (const section of members) {
      const paragraphIndexes = [
        ...new Set(section.blocks.map((block) => block.paragraphIndex)),
      ].sort((left, right) => left - right);
      const paragraphIndexMap = new Map(
        paragraphIndexes.map((index, offset) => [index, paragraphBase + offset]),
      );

      for (const block of section.blocks) {
        blocks.push({
          ...block,
          startOffset: block.startOffset + offsetBase,
          endOffset: block.endOffset + offsetBase,
          paragraphIndex: paragraphIndexMap.get(block.paragraphIndex) ?? paragraphBase,
        });
      }

      const sectionEnd = section.blocks.reduce((max, block) => Math.max(max, block.endOffset), 0);
      offsetBase += sectionEnd + 1;
      paragraphBase += paragraphIndexes.length;
    }

    return {
      sectionId: chapterId,
      sectionTitle:
        members.find((section) => section.id === chapterId)?.title ??
        members[0]?.title ??
        "Capítulo",
      contentVersion: Math.max(1, ...members.map((section) => section.version)),
      contentHash: members.map((section) => `${section.id}:${section.contentHash}`).join("|"),
      blocks,
    };
  });
}
