import {
  CHAPTER_LIKE_SECTION_TYPES,
  parseTiptapDocument,
  type TiptapDocument,
  type TiptapNode,
} from "@escribiendo/book-schema";
import {
  runsToText,
  type InlineRun,
  type LayoutBlock,
  type LayoutBlockKind,
} from "@escribiendo/editorial-engine";
import { editorialImageFromNode } from "./image";
import { inlineRuns, listRuns, trimRuns } from "./inline";

/**
 * Conversión del manuscrito a bloques de maquetación.
 *
 * El motor de paginación no sabe nada de Tiptap: recibe bloques con su clase
 * y sus tramos de texto con formato. La traducción vive aquí, que es donde se
 * conoce el documento.
 */

export interface PreviewSection {
  id: string;
  title: string;
  type: string;
  content: unknown;
  /** La sección abre un capítulo. */
  isChapter: boolean;
  /** La sección debe empezar en página par. */
  startOnOddPage: boolean;
}

function headingKind(node: TiptapNode): LayoutBlockKind {
  const level = Number(node.attrs?.level ?? 1);

  if (level <= 1) {
    return "heading1";
  }

  if (level === 2) {
    return "heading2";
  }

  if (level === 3) {
    return "heading3";
  }

  return "heading4";
}

/**
 * Convierte el contenido de una sección en bloques de maquetación.
 */
export function sectionToBlocks(section: PreviewSection): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  let index = 0;

  const registration = (): Pick<LayoutBlock, "sectionId" | "sectionTitle"> => ({
    sectionId: section.id,
    sectionTitle: section.title,
  });

  const pushRuns = (kind: LayoutBlockKind, runs: InlineRun[]): void => {
    const limpios = trimRuns(runs);
    const text = runsToText(limpios);

    if (text.trim().length === 0) {
      return;
    }

    blocks.push({
      id: `${section.id}-${index}`,
      kind,
      text,
      runs: limpios,
      ...registration(),
      firstOfSection: index === 0,
    });

    index += 1;
  };

  /** Reglas y separadores: no tienen texto, pero sí ocupan su línea. */
  const pushRule = (): void => {
    blocks.push({
      id: `${section.id}-${index}`,
      kind: "rule",
      text: "",
      runs: [],
      ...registration(),
      firstOfSection: index === 0,
    });

    index += 1;
  };

  /** Imagen: conserva origen, pie, proporciones y alineación. */
  const pushImage = (node: TiptapNode): void => {
    const image = editorialImageFromNode(node);

    blocks.push({
      id: `${section.id}-${index}`,
      kind: "image",
      text: image.alt ?? image.caption ?? "",
      image,
      ...registration(),
      firstOfSection: index === 0,
    });

    index += 1;
  };

  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    return blocks;
  }

  for (const node of document.content ?? []) {
    switch (node.type) {
      case "heading":
        pushRuns(headingKind(node), inlineRuns(node));
        break;

      case "paragraph":
        pushRuns("body", inlineRuns(node));
        break;

      case "blockquote":
        pushRuns("blockquote", inlineRuns(node));
        break;

      case "codeBlock":
        pushRuns("code", inlineRuns(node));
        break;

      case "bulletList":
      case "orderedList":
        pushRuns("list", listRuns(node));
        break;

      case "horizontalRule":
      case "sceneBreak":
        pushRule();
        break;

      case "image":
        pushImage(node);
        break;

      default: {
        const runs = inlineRuns(node);

        if (runs.length > 0) {
          pushRuns("body", runs);
        }

        break;
      }
    }
  }

  return blocks;
}

/**
 * Compone los bloques de todas las secciones de un libro.
 *
 * La primera sección no es un capítulo: es la parte preliminar. A partir de
 * ahí, cada sección de tipo capítulo abre en página par.
 */
export function bookToBlocks(sections: PreviewSection[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  let chapterSeen = false;

  for (const section of sections) {
    const sectionBlocks = sectionToBlocks(section);
    const opensChapter = section.isChapter && (chapterSeen || section.startOnOddPage);

    if (section.isChapter) {
      chapterSeen = true;
    }

    sectionBlocks.forEach((block, index) => {
      blocks.push({
        ...block,
        startsChapter: opensChapter && index === 0,
        firstOfSection: index === 0,
      });
    });
  }

  return blocks;
}

/** Indica si un tipo de sección abre un capítulo. */
export function isChapterType(type: string): boolean {
  return CHAPTER_LIKE_SECTION_TYPES.has(
    type as Parameters<typeof CHAPTER_LIKE_SECTION_TYPES.has>[0],
  );
}
