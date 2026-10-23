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
import { sectionDisplayTitles } from "./section-title";

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
  /** El título editorial entra en el índice. */
  showInToc: boolean;
  /** El título editorial se muestra en el cuerpo. */
  showTitle: boolean;
  /** El título se acompaña con la etiqueta del tipo. */
  showSectionType: boolean;
  /** El título se acompaña con el número correlativo. */
  showSectionNumber: boolean;
}

const SECTION_TYPES_WITH_TITLE = new Set([
  "PART",
  "CHAPTER",
  "INTERLUDE",
  "PROLOGUE",
  "EPILOGUE",
  "INTRODUCTION",
  "FOREWORD",
  "ACKNOWLEDGMENTS",
  "AUTHOR_NOTES",
  "ABOUT_AUTHOR",
  "BIBLIOGRAPHY",
  "GLOSSARY",
  "APPENDIX",
  "SUBCHAPTER",
]);

/**
 * Materia editorial ya compuesta, lista para entrar en la maqueta.
 *
 * El identificador es el de la materia y no el de una sección: permite auditar
 * qué bloque vino de los preliminares y no del manuscrito.
 */
export interface MatterLayout {
  id: string;
  blocks: readonly LayoutBlock[];
}

export interface BookBlocksOptions {
  /** Compone la inicial capitular del primer párrafo de cada capítulo. */
  dropCaps?: boolean;
  /** Preliminares, en orden editorial y ya compuestos. */
  frontMatter?: readonly MatterLayout[];
  /** Materias finales, en orden editorial y ya compuestas. */
  backMatter?: readonly MatterLayout[];
}

/** Indica si el tipo de sección presenta el título guardado. */
export function sectionShowsTitle(type: string, title: string): boolean {
  return SECTION_TYPES_WITH_TITLE.has(type.toUpperCase()) && title.trim().length > 0;
}

/** Detecta si el primer bloque del cuerpo ya repite el nombre de la sección. */
export function repeatsSectionTitle(
  blocks: readonly Pick<LayoutBlock, "text">[],
  sectionTitle: string,
): boolean {
  const first = blocks[0]?.text;

  return first !== undefined && normalizeTitle(first) === normalizeTitle(sectionTitle);
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/gu, "").toLocaleLowerCase("es");
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
 *
 * Es una traducción pura del contenido. El título editorial no se inserta aquí:
 * lo compone y deduplica bookToBlocks, que tiene visión del libro completo.
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
  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(section.content);
  } catch {
    // Un contenido ilegible no debe romper la composición del libro: la sección
    // queda vacía y bookToBlocks conserva igualmente su título editorial.
    return blocks;
  }

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
 * El título editorial se compone aquí con la etiqueta y el número que haya
 * elegido el autor, se deduplica contra el contenido y se descarta cuando el
 * tipo de sección no lo presenta (dedicatoria, cubierta, créditos).
 */
export function bookToBlocks(
  sections: readonly PreviewSection[],
  options: BookBlocksOptions = {},
): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  const footnotes: FootnoteCounter = { next: 1 };
  const titles = sectionDisplayTitles(sections);
  const frontMatter = options.frontMatter ?? [];
  let chapterSeen = false;

  for (const matter of frontMatter) {
    appendMatter(blocks, matter);
  }

  // Donde empieza el cuerpo: después de los preliminares, que nunca comparten
  // página con el primer capítulo.
  const bodyStart = blocks.length;

  for (const section of sections) {
    const sectionBlocks = sectionToBlocks(section, footnotes).map((block) =>
      section.type === "DEDICATION" ? { ...block, alignment: "right" as const } : block,
    );
    const opensChapter = section.isChapter && (chapterSeen || section.startOnOddPage);
    const visibleTitle = titles.get(section.id) ?? null;
    // Convención editorial (por tipo) y elección del autor: el título compuesto
    // solo aparece cuando las dos lo permiten.
    const showsTitle = sectionShowsTitle(section.type, section.title) && visibleTitle !== null;
    const composed = visibleTitle ?? section.title.trim();
    const repeatsTitle =
      showsTitle &&
      (repeatsSectionTitle(sectionBlocks, section.title) ||
        (visibleTitle !== null && repeatsSectionTitle(sectionBlocks, visibleTitle)));
    const contentBlocks = repeatsTitle ? sectionBlocks.slice(1) : sectionBlocks;
    const titleBlock: LayoutBlock | null = showsTitle
      ? {
          id: `${section.id}-title`,
          kind: section.type.toUpperCase() === "SUBCHAPTER" ? "heading2" : "chapterTitle",
          text: composed,
          ...registrationFor(section),
          firstOfSection: true,
        }
      : null;

    if (section.isChapter) {
      chapterSeen = true;
    }

    if (titleBlock) {
      blocks.push({
        ...titleBlock,
        startsChapter: opensChapter,
        breaksBefore: section.pageBreakBefore === true,
      });
    }

    let firstBodyAfterTitle = false;

    contentBlocks.forEach((block, index) => {
      const firstParagraph = titleBlock !== null && block.kind === "body" && !firstBodyAfterTitle;

      if (firstParagraph) {
        firstBodyAfterTitle = true;
      }

      blocks.push({
        ...block,
        ...(options.dropCaps &&
        section.isChapter &&
        section.type.toUpperCase() !== "SUBCHAPTER" &&
        firstParagraph &&
        block.text.length > 0
          ? { dropCapCharacter: Array.from(block.text)[0] }
          : {}),
        startsChapter: !titleBlock && opensChapter && index === 0,
        firstOfSection: titleBlock ? firstParagraph : index === 0,
        // Un salto propio de la sección abre página nueva, aunque la sección
        // no sea un capítulo.
        breaksBefore: !titleBlock && index === 0 && section.pageBreakBefore === true,
      });
    });
  }

  // Un capítulo que empieza pegado a la última página de los preliminares
  // parece parte de ellos: el cuerpo abre siempre página nueva.
  if (bodyStart > 0 && bodyStart < blocks.length) {
    const firstBody = blocks[bodyStart];

    if (firstBody && firstBody.breaksBefore !== true && firstBody.startsChapter !== true) {
      blocks[bodyStart] = { ...firstBody, breaksBefore: true };
    }
  }

  for (const matter of options.backMatter ?? []) {
    appendMatter(blocks, matter);
  }

  return blocks;
}

/**
 * Incorpora una materia a la maqueta.
 *
 * La materia siempre abre página: una dedicatoria al pie de un capítulo es un
 * error de imprenta, no un ahorro de papel. Una materia sin bloques no deja una
 * página en blanco: lo más probable es que no esté lista, y su generador ya
 * emite el aviso.
 */
function appendMatter(target: LayoutBlock[], matter: MatterLayout): void {
  matter.blocks.forEach((block, index) => {
    target.push(index === 0 ? { ...block, breaksBefore: true } : block);
  });
}

function registrationFor(section: PreviewSection): Pick<LayoutBlock, "sectionId" | "sectionTitle"> {
  return { sectionId: section.id, sectionTitle: section.title };
}

/** Indica si un tipo de sección abre un capítulo. */
export function isChapterType(type: string): boolean {
  return CHAPTER_LIKE_SECTION_TYPES.has(
    type as Parameters<typeof CHAPTER_LIKE_SECTION_TYPES.has>[0],
  );
}
