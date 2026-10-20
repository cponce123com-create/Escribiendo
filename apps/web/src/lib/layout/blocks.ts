import {
  CHAPTER_LIKE_SECTION_TYPES,
  parseTiptapDocument,
  type TiptapDocument,
  type TiptapNode,
} from "@escribiendo/book-schema";
import type { LayoutBlock, LayoutBlockKind } from "@escribiendo/editorial-engine";

/**
 * Conversión del manuscrito a bloques de maquetación.
 *
 * El motor de paginación no sabe nada de Tiptap: recibe bloques con su clase
 * y su texto. La traducción vive aquí, que es donde se conoce el documento.
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

/** Texto de un nodo, incluidos sus descendientes. */
function nodeText(node: TiptapNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return (node.content ?? []).map(nodeText).join("");
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

/** Texto de una lista: cada elemento en su propia línea. */
function listText(node: TiptapNode): string {
  const items = (node.content ?? [])
    .filter((child) => child.type === "listItem")
    .map((child) => nodeText(child).trim())
    .filter((text) => text.length > 0);

  return items.join("\n");
}

/**
 * Convierte el contenido de una sección en bloques de maquetación.
 */
export function sectionToBlocks(section: PreviewSection): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  let index = 0;

  const push = (kind: LayoutBlockKind, text: string): void => {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return;
    }

    blocks.push({
      id: `${section.id}-${index}`,
      kind,
      text: trimmed,
      sectionId: section.id,
      sectionTitle: section.title,
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
        push(headingKind(node), nodeText(node));
        break;

      case "paragraph":
        push("body", nodeText(node));
        break;

      case "blockquote":
        push("blockquote", nodeText(node));
        break;

      case "codeBlock":
        push("code", nodeText(node));
        break;

      case "bulletList":
      case "orderedList":
        push("list", listText(node));
        break;

      case "horizontalRule":
      case "sceneBreak":
        push("rule", "");
        break;

      case "image":
        push("image", "");
        break;

      default:
        push("body", nodeText(node));
        break;
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
