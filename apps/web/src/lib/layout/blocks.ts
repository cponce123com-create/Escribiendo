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
import { inlineRuns, listRuns, trimRuns, type FootnoteCounter } from "./inline";
import { displayTitleForSection, sectionDisplayTitles } from "./section-title";

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
  /** La sección empieza en página nueva, aunque no abra capítulo. */
  pageBreakBefore: boolean;
  /** La sección entra en la maqueta y en la exportación. */
  includeInExport: boolean;
  /** La sección aparece en el índice. */
  showInToc: boolean;
  /** El título editorial se inserta en el cuerpo. */
  showTitle: boolean;
  /** El título se acompaña con la etiqueta del tipo. */
  showSectionType: boolean;
  /** El título se acompaña con el número correlativo. */
  showSectionNumber: boolean;
  /** Título ya compuesto con etiqueta y número, si procede. */
  displayTitle?: string | null;
}

/**
 * Secciones que entran en la maqueta y en los archivos exportados.
 *
 * Una sección puede quedar excluida del libro; entonces no se compone ni se
 * exporta, y la vista previa tiene que reflejarlo igual que el PDF.
 */
export function seccionesExportables<T extends { id: string; includeInExport?: boolean }>(
  sections: readonly T[],
): T[] {
  return sections.filter((section) => section.includeInExport !== false);
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
export function sectionToBlocks(
  section: PreviewSection,
  footnotes?: FootnoteCounter,
): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  // Una llamada directa sin contador compartido sigue numerando dentro de su
  // propia sección; el libro completo debe pasar un contador desde bookToBlocks.
  const counter = footnotes ?? { next: 1 };
  let index = 0;
  let document: TiptapDocument | null = null;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    // Un contenido inválido no debe ocultar el título editorial: se conserva
    // el título y se deja el cuerpo vacío para que la maqueta lo muestre.
  }

  const baseTitle = section.displayTitle === undefined ? section.title : section.displayTitle;
  const title =
    baseTitle === null
      ? null
      : displayTitleForSection(baseTitle, document, [section.title]);

  const registration = (): Pick<LayoutBlock, "sectionId" | "sectionTitle"> => ({
    sectionId: section.id,
    sectionTitle: section.title,
  });

  if (title) {
    blocks.push({
      id: `${section.id}-${index}`,
      kind: "title",
      text: title,
      runs: [{ text: title }],
      ...registration(),
      firstOfSection: true,
    });
    index += 1;
  }

  const pushRuns = (kind: LayoutBlockKind, runs: InlineRun[]): void => {
    const limpios = trimRuns(runs);
    const text = runsToText(limpios);

    if (text.trim().length === 0) {
      return;
    }

    // La primera línea del cuerpo tras el título abre el capítulo sin sangría,
    // igual que cuando el capítulo no tenía un bloque de título.
    const effectiveKind: LayoutBlockKind =
      kind === "body" && title !== null && index === 1 ? "firstParagraph" : kind;

    blocks.push({
      id: `${section.id}-${index}`,
      kind: effectiveKind,
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

  if (!document) {
    return blocks;
  }

  for (const node of document.content ?? []) {
    switch (node.type) {
      case "heading":
        pushRuns(headingKind(node), inlineRuns(node, counter));
        break;

      case "paragraph":
        pushRuns("body", inlineRuns(node, counter));
        break;

      case "blockquote":
        pushRuns("blockquote", inlineRuns(node, counter));
        break;

      case "codeBlock":
        pushRuns("code", inlineRuns(node, counter));
        break;

      case "bulletList":
      case "orderedList":
        pushRuns("list", listRuns(node, counter));
        break;

      case "horizontalRule":
      case "sceneBreak":
        pushRule();
        break;

      case "image":
        pushImage(node);
        break;

      default: {
        const runs = inlineRuns(node, counter);

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
  const footnotes: FootnoteCounter = { next: 1 };
  const titles = sectionDisplayTitles(sections);
  let chapterSeen = false;

  for (const section of sections) {
    const sectionBlocks = sectionToBlocks(
      { ...section, displayTitle: titles.get(section.id) ?? null },
      footnotes,
    );
    const opensChapter = section.isChapter && (chapterSeen || section.startOnOddPage);

    if (section.isChapter) {
      chapterSeen = true;
    }

    sectionBlocks.forEach((block, index) => {
      blocks.push({
        ...block,
        startsChapter: opensChapter && index === 0,
        firstOfSection: index === 0,
        // Un salto propio de la sección abre página nueva, aunque la sección
        // no sea un capítulo.
        breaksBefore: index === 0 && section.pageBreakBefore === true,
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
