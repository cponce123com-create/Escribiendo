import {
  computeImageLayout,
  IMAGE_CAPTION_SCALE,
  type EditorialImage,
  type ImageLayout,
} from "./image";
import { dropCapMetrics, normalizeDropCapLines, type DropCapLines } from "./drop-cap";
import { breakIntoLines, measureTextMm, type LineBreak, type MeasureText } from "./measure";
import { breakRunsIntoLines, type InlineFootnote, type InlineRun } from "./rich-text";
import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  withTypographyDefaults,
  type TextAlignment,
  type TypographyConfig,
  type TypographyStyle,
} from "./typography";

/**
 * Motor de paginación.
 *
 * Compone el manuscrito en páginas a partir de la geometría de la maqueta y
 * de la configuración tipográfica, y avisa de los problemas de composición
 * que la edición necesita ver: viudas, huérfanas, desbordes y líneas
 * demasiado largas.
 *
 * La composición se hace por altura, no por número de líneas: así conviven
 * en la misma página un cuerpo de 11 pt y un título de 20 pt sin que la
 * cuenta de líneas tenga que ser la misma para todos.
 */

export type LayoutBlockKind =
  | "title"
  | "body"
  | "firstParagraph"
  | "chapterTitle"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "blockquote"
  | "code"
  | "list"
  | "rule"
  | "image";

export interface LayoutBlock {
  styleOverride?: Partial<
    Pick<
      TypographyStyle,
      "fontSizePt" | "lineHeight" | "spaceAfterPt" | "spaceBeforePt" | "firstLineIndentMm"
    >
  >;
  /**
   * Entrada de índice. El folio no forma parte del texto: se compone como una
   * columna anclada a la derecha y los líderes se dibujan como geometría.
   */
  tocEntry?: {
    title: string;
    label: string;
    leaders: boolean;
    /** Sección a la que apunta la entrada, para cotejar el folio final. */
    sourceId?: string;
    /** Separación entre el último carácter del título, los líderes y el folio. */
    folioGapMm?: number;
    /** Nivel jerárquico, para sangría en formatos refluibles. */
    level?: number;
  };
  id: string;
  kind: LayoutBlockKind;
  text: string;
  /**
   * Tramos con formato en línea. Si falta, el bloque se compone como texto
   * plano; si está, cada tramo se mide con su estilo.
   */
  runs?: InlineRun[];
  /** Identificador de la sección del libro de la que procede. */
  sectionId?: string;
  /** Título de la sección, para los encabezados de página. */
  sectionTitle?: string;
  /** El bloque abre un capítulo y puede forzar página par. */
  startsChapter?: boolean;
  /** El bloque es el primero de su sección. */
  firstOfSection?: boolean;
  /** Inicial opcional para el primer párrafo del capítulo. */
  dropCapCharacter?: string;
  /** Líneas de cuerpo que ocupa la inicial (2 o 3). */
  dropCapLines?: DropCapLines;
  /** Espacio reservado a la inicial capitular durante sus líneas. */
  dropCapIndentMm?: number;
  /**
   * El bloque tiene que empezar en una página nueva. Se usa para los saltos
   * de página que pide la sección.
   */
  breaksBefore?: boolean;
  /** Referencia de la imagen, cuando `kind` es `image`. */
  image?: EditorialImage;
  /**
   * Alineación propia del bloque, que prevalece sobre la de su clase.
   *
   * Las páginas estructuradas (portadilla, dedicatoria, créditos) usan la
   * misma clase tipográfica que el cuerpo pero no siempre la misma alineación:
   * centrar una dedicatoria no debe obligar a inventar un estilo nuevo.
   */
  alignment?: TextAlignment;
}

export interface PageGeometry {
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginInnerMm: number;
  marginOuterMm: number;
  gutterMm?: number;
  headerDistanceMm?: number;
  footerDistanceMm?: number;
  /** Cada capítulo empieza en página par (la derecha). */
  chapterStartsRecto?: boolean;
  /** Número de la primera página. */
  firstPageNumber?: number;
  /** Physical pages preceding the body (cover, preliminaries); independent of folios. */
  physicalPageOffset?: number;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface LayoutDiagnostic {
  code:
    | "WIDOW"
    | "ORPHAN"
    | "OVERFLOW"
    | "LINE_TOO_LONG"
    | "LONG_WORD"
    | "EMPTY_PAGE"
    | "CHAPTER_NOT_ON_RECTO"
    | "FOOTNOTE_OVERFLOW"
    | "TOC_NOT_CONVERGED"
    | "TOC_FOLIO_MISMATCH"
    | "MATTER_LOGO_OMITIDO";
  severity: DiagnosticSeverity;
  message: string;
  /** Página en la que se ha detectado, contando desde 1. */
  page?: number;
  sectionId?: string;
  blockId?: string;
}

export interface LaidOutLine {
  text: string;
  hyphenated: boolean;
  overflow: boolean;
  /** Tramos con su formato, para dibujar la línea con sus estilos. */
  segments?: InlineRun[];
  /**
   * Folio de una entrada de índice y sus líderes, en milímetros relativos al
   * borde izquierdo de la caja de texto. No forma parte de `text`.
   */
  toc?: TocFolioGeometry;
}

/** Columna de folio de una línea de índice, ya medida. */
export interface TocFolioGeometry {
  /** Texto impreso del folio. */
  text: string;
  /** Borde izquierdo del folio. */
  xMm: number;
  /** Ancho medido del folio. */
  widthMm: number;
  /** Inicio del líder; `null` si la plantilla no dibuja puntos. */
  leaderStartMm: number | null;
  /** Fin del líder. */
  leaderEndMm: number | null;
  /** El líder se dibuja punteado. */
  dotted: boolean;
}

export interface LaidOutBlock {
  id: string;
  kind: LayoutBlockKind;
  style: TypographyStyle;
  lines: LaidOutLine[];
  /** Espacio en blanco antes del bloque, en milímetros. */
  spaceBeforeMm: number;
  /** Espacio en blanco después del bloque, en milímetros. */
  spaceAfterMm: number;
  sectionId?: string;
  sectionTitle?: string;
  startsChapter?: boolean;
  /** El bloque es el primero de su sección. */
  firstOfSection?: boolean;
  /** El bloque continúa de un párrafo partido en la página anterior. */
  continued?: boolean;
  /** Inicial opcional para la primera línea del párrafo. */
  dropCapCharacter?: string;
  /** Líneas de cuerpo que ocupa la inicial. */
  dropCapLines?: DropCapLines;
  /** Cuerpo de la inicial, en puntos. */
  dropCapSizePt?: number;
  /** Espacio reservado a la inicial capitular durante sus líneas. */
  dropCapIndentMm?: number;
  /** Sangría aplicada solo a la primera línea del primer fragmento. */
  firstLineIndentMm?: number;
  /** Imagen y su caja compuesta, cuando el bloque es una imagen. */
  image?: EditorialImage;
  imageLayout?: ImageLayout;
}

/** Nota al pie compuesta en una página. */
export interface LaidOutFootnote {
  id: string;
  number: number;
  /** Texto original de la nota, sin el número. */
  text: string;
  /** Líneas ya compuestas, con el número delante de la primera. */
  lines: string[];
}

export interface LaidOutPage {
  /** Número de página, contando desde 1. */
  index: number;
  /** Folio impreso. */
  folio: number;
  /** `recto` es la página derecha (impar), `verso` la izquierda. */
  side: "recto" | "verso";
  blocks: LaidOutBlock[];
  /** Altura ocupada en la página, incluidas las notas, en milímetros. */
  usedHeightMm: number;
  /** Altura disponible, en milímetros. */
  totalHeightMm: number;
  /** Notas al pie que corresponden a llamadas de esta página. */
  footnotes: LaidOutFootnote[];
  /** Altura reservada por las notas al pie, en milímetros. */
  footnotesHeightMm: number;
  /** Encabezado de la página. */
  runningHead: string | null;
  /** Página en blanco insertada para forzar un comienzo en par. */
  blank: boolean;
}

export interface PaginationResult {
  pages: LaidOutPage[];
  diagnostics: LayoutDiagnostic[];
  /** Ancho del área de texto, en milímetros. */
  textWidthMm: number;
  /** Alto del área de texto, en milímetros. */
  textHeightMm: number;
}

const POINTS_TO_MM = 25.4 / 72;

/** Proporción del cuerpo que se usa para las notas al pie. */
const FOOTNOTE_SCALE = 0.78;
/** Interlineado de las notas, más compacto que el del cuerpo. */
const FOOTNOTE_LINE_HEIGHT = 1.3;
/** Separación entre dos notas consecutivas. */
const FOOTNOTE_GAP_MM = 1.5;
/** Espacio de la línea separadora antes de la primera nota. */
const FOOTNOTE_SEPARATOR_MM = 3;
/** Caída tipográfica que separa el título de capítulo del borde superior. */
export const CHAPTER_TITLE_SINK_PT = 36;

/** Indica si la clase de bloque se compone en negrita. */
export function isHeadingKind(kind: LayoutBlockKind): boolean {
  return kind === "title" || kind === "chapterTitle" || kind.startsWith("heading");
}

function toMm(points: number): number {
  return points * POINTS_TO_MM;
}

function styleFor(config: TypographyConfig, kind: LayoutBlockKind): TypographyStyle {
  switch (kind) {
    case "title":
    case "heading1":
    case "chapterTitle":
      return config.heading1;
    case "heading2":
      return config.heading2;
    case "heading3":
      return config.heading3;
    case "heading4":
      return config.heading4;
    case "blockquote":
      return config.blockquote;
    case "code":
      return config.code;
    case "list":
      return config.list;
    case "firstParagraph":
      return config.firstParagraph;
    case "body":
    case "rule":
    case "image":
      return config.body;
  }
}

/** Altura de una línea, en milímetros. */
export function lineHeightMm(style: TypographyStyle): number {
  return toMm(style.fontSizePt * style.lineHeight);
}

/** Ancho y alto del área de texto. */
export function textBlockSize(geometry: PageGeometry): { widthMm: number; heightMm: number } {
  const widthMm =
    geometry.pageWidthMm -
    geometry.marginInnerMm -
    geometry.marginOuterMm -
    (geometry.gutterMm ?? 0);

  const heightMm = geometry.pageHeightMm - geometry.marginTopMm - geometry.marginBottomMm;

  return { widthMm, heightMm };
}

/**
 * Compone el manuscrito en páginas.
 */
export function paginate(
  blocks: LayoutBlock[],
  geometry: PageGeometry,
  typographyInput: unknown,
  measure?: MeasureText,
): PaginationResult {
  const typography = withTypographyDefaults(typographyInput ?? DEFAULT_TYPOGRAPHY_CONFIG);
  const diagnostics: LayoutDiagnostic[] = [];
  const { widthMm, heightMm } = textBlockSize(geometry);

  const pages: LaidOutPage[] = [];
  const chapterStartsRecto = geometry.chapterStartsRecto ?? true;
  const firstPageNumber = geometry.firstPageNumber ?? 1;
  const minAtBottom = typography.widowOrphan.minLinesAtBottom;
  const minAtTop = typography.widowOrphan.minLinesAtTop;

  let currentBlocks: LaidOutBlock[] = [];
  let usedHeightMm = 0;
  let currentFootnotes: LaidOutFootnote[] = [];
  let footnotesHeightMm = 0;
  let currentRunningHead: string | null = null;
  let pageIndex = 0;

  const footnoteFontSizePt = typography.body.fontSizePt * FOOTNOTE_SCALE;
  const footnoteLineHeightMm = toMm(footnoteFontSizePt * FOOTNOTE_LINE_HEIGHT);

  const pageSide = (index: number): "recto" | "verso" =>
    (index - 1 + (geometry.physicalPageOffset ?? 0)) % 2 === 0 ? "recto" : "verso";

  const flushPage = (blank = false): void => {
    pageIndex += 1;

    pages.push({
      index: pageIndex,
      folio: firstPageNumber + pageIndex - 1,
      side: pageSide(pageIndex),
      blocks: currentBlocks,
      usedHeightMm,
      totalHeightMm: heightMm,
      footnotes: currentFootnotes,
      footnotesHeightMm,
      // La página que abre un capítulo lleva el título en el cuerpo; repetirlo
      // como encabezado sería una duplicación visible.
      runningHead:
        blank || currentBlocks.some((block) => block.kind === "title") ? null : currentRunningHead,
      blank,
    });

    currentBlocks = [];
    currentFootnotes = [];
    usedHeightMm = 0;
    footnotesHeightMm = 0;
  };

  const placeBlock = (block: LaidOutBlock, height: number): void => {
    currentBlocks.push(block);
    usedHeightMm += height;
  };

  /** Compone el texto de una nota con el cuerpo menor y el ancho útil. */
  const composeFootnote = (reference: InlineFootnote): LaidOutFootnote => {
    const lines = breakIntoLines(`${reference.number}. ${reference.note}`, {
      fontFamily: typography.body.fontFamily,
      fontSizePt: footnoteFontSizePt,
      letterSpacingPt: 0,
      lineWidthMm: widthMm,
      hyphenation: typography.body.hyphenation,
      ...(measure ? { measure } : {}),
    });

    return {
      id: reference.id,
      number: reference.number,
      text: reference.note,
      lines: lines.map((line) => line.text),
    };
  };

  /** Notas nuevas que aparecen en un grupo de líneas, sin repetir las ya puestas. */
  const newFootnotesIn = (lines: ReadonlyArray<{ segments?: InlineRun[] }>): LaidOutFootnote[] => {
    const known = new Set(currentFootnotes.map((footnote) => footnote.id));
    const result: LaidOutFootnote[] = [];

    for (const line of lines) {
      for (const segment of line.segments ?? []) {
        const reference = segment.footnote;

        if (!reference || known.has(reference.id)) {
          continue;
        }

        known.add(reference.id);
        result.push(composeFootnote(reference));
      }
    }

    return result;
  };

  /** Altura que añaden unas notas, incluida la línea separadora si es la primera. */
  const footnoteHeight = (notes: readonly LaidOutFootnote[]): number => {
    if (notes.length === 0) {
      return 0;
    }

    const separator = currentFootnotes.length === 0 ? FOOTNOTE_SEPARATOR_MM : 0;
    return (
      separator +
      notes.reduce(
        (total, note) => total + note.lines.length * footnoteLineHeightMm + FOOTNOTE_GAP_MM,
        0,
      )
    );
  };

  /** Registra las notas de un grupo de líneas y descuenta su altura de la página. */
  const registerFootnotes = (lines: ReadonlyArray<{ segments?: InlineRun[] }>): number => {
    const notes = newFootnotesIn(lines);

    if (notes.length === 0) {
      return 0;
    }

    const height = footnoteHeight(notes);
    currentFootnotes.push(...notes);
    footnotesHeightMm += height;
    usedHeightMm += height;

    return height;
  };

  for (const block of blocks) {
    const abreCapitulo = block.startsChapter === true;
    const cortaPagina = block.breaksBefore === true;

    if (abreCapitulo || cortaPagina) {
      // Un capítulo o un bloque con salto propio empieza en página nueva. Si
      // la página en curso ya tiene contenido, se cierra **con su contenido**:
      // marcar como en blanco una página compuesta esconde texto que sí va en
      // el archivo final.
      if (currentBlocks.length > 0) {
        flushPage();
      }
    }

    if (abreCapitulo && chapterStartsRecto) {
      // Se insertan páginas vacías hasta que la siguiente sea un recto. La
      // página insertada no tiene bloques: está realmente en blanco.
      while (pageSide(pageIndex + 1) !== "recto") {
        flushPage(true);

        diagnostics.push({
          code: "CHAPTER_NOT_ON_RECTO",
          severity: "info",
          message: "Se ha insertado una página en blanco para que el capítulo abra a la derecha.",
          page: pageIndex + 1,
          sectionId: block.sectionId,
        });
      }
    }

    if (block.sectionTitle && block.sectionTitle !== currentRunningHead) {
      currentRunningHead = block.sectionTitle;
    }

    const baseStyle = { ...styleFor(typography, block.kind), ...block.styleOverride };
    const chapterStyle =
      block.kind === "chapterTitle"
        ? {
            ...baseStyle,
            spaceBeforePt: baseStyle.spaceBeforePt + CHAPTER_TITLE_SINK_PT,
          }
        : baseStyle;
    // La alineación del bloque manda sobre la de su clase: así una página
    // centrada no obliga a crear un estilo tipográfico por cada materia.
    const style: TypographyStyle = block.alignment
      ? { ...chapterStyle, alignment: block.alignment }
      : chapterStyle;
    const spaceBeforeMm = toMm(style.spaceBeforePt);
    const spaceAfterMm = toMm(style.spaceAfterPt);
    const lineHeight = lineHeightMm(style);

    if (block.kind === "rule") {
      const height = spaceBeforeMm + lineHeight + spaceAfterMm;

      if (usedHeightMm + height > heightMm && usedHeightMm > 0) {
        flushPage();
      }

      placeBlock(
        {
          id: block.id,
          kind: block.kind,
          style,
          lines: [],
          spaceBeforeMm,
          spaceAfterMm,
          sectionId: block.sectionId,
          sectionTitle: block.sectionTitle,
          startsChapter: block.startsChapter,
          firstOfSection: block.firstOfSection,
        },
        height,
      );
      continue;
    }

    if (block.kind === "image") {
      // El espacio anterior y posterior también ocupa página: la imagen debe
      // caber con ellos, no solo con su pie.
      const availableHeightMm = Math.max(12, heightMm - spaceBeforeMm - spaceAfterMm);
      const imageLayout = computeImageLayout(block.image, {
        textWidthMm: widthMm,
        textHeightMm: availableHeightMm,
        captionFontFamily: typography.body.fontFamily,
        captionFontSizePt: typography.body.fontSizePt * IMAGE_CAPTION_SCALE,
        ...(measure ? { measure } : {}),
      });
      const height = spaceBeforeMm + imageLayout.totalHeightMm + spaceAfterMm;

      if (usedHeightMm + height > heightMm && usedHeightMm > 0) {
        flushPage();
      }

      placeBlock(
        {
          id: block.id,
          kind: block.kind,
          style,
          lines: [],
          spaceBeforeMm,
          spaceAfterMm,
          sectionId: block.sectionId,
          sectionTitle: block.sectionTitle,
          startsChapter: block.startsChapter,
          firstOfSection: block.firstOfSection,
          image: block.image,
          imageLayout,
        },
        height,
      );
      continue;
    }

    const indentMm =
      block.kind === "body" && block.firstOfSection
        ? typography.firstParagraphNoIndent
          ? 0
          : typography.bodyFirstLineIndentMm
        : block.kind === "firstParagraph"
          ? 0
          : style.firstLineIndentMm;

    const dropCapLines = normalizeDropCapLines(block.dropCapLines);
    const dropCap = block.dropCapCharacter
      ? dropCapMetrics(
          block.dropCapCharacter,
          {
            fontFamily: style.fontFamily,
            fontSizePt: style.fontSizePt,
            letterSpacingPt: style.letterSpacingPt,
            uppercase: style.uppercase,
            bold: isHeadingKind(block.kind),
          },
          dropCapLines,
          measure,
        )
      : null;
    const dropCapIndentMm = dropCap?.advanceMm ?? 0;
    const dropCapFields = dropCap
      ? { dropCapSizePt: dropCap.sizePt, dropCapLines: dropCap.lines }
      : {};
    const breakOptions = {
      fontFamily: style.fontFamily,
      fontSizePt: style.fontSizePt,
      letterSpacingPt: style.letterSpacingPt,
      uppercase: style.uppercase,
      smallCaps: style.smallCaps,
      lineWidthMm: widthMm,
      firstLineIndentMm: indentMm + dropCapIndentMm,
      ...(dropCap
        ? {
            lineIndentsMm: Array.from({ length: dropCap.lines }, (_, lineIndex) =>
              lineIndex === 0 ? indentMm + dropCapIndentMm : dropCapIndentMm,
            ),
          }
        : {}),
      hyphenation: style.hyphenation,
      // Los títulos se componen en negrita: si se midieran como redonda, la
      // línea cabría en el cálculo y se saldría en el papel.
      bold: isHeadingKind(block.kind),
      ...(measure ? { measure } : {}),
    };

    let lines: LaidOutLine[] =
      block.runs && block.runs.length > 0
        ? breakRunsIntoLines(block.runs, breakOptions)
        : breakIntoLines(block.text, breakOptions).map((line) => ({
            ...line,
            segments: [{ text: line.text }],
          }));

    if (block.tocEntry) {
      const entry = block.tocEntry;
      const measureString = (text: string) => measureTextMm(text, { ...breakOptions });
      const gapMm = Math.max(0, entry.folioGapMm ?? 1.5);
      const labelWidth = measureString(entry.label);
      // El folio se ancla al borde derecho de la caja: su columna empieza donde
      // termina el ancho útil menos el ancho medido del número.
      const folioXMm = Math.max(0, widthMm - labelWidth);
      const titles = breakIntoLines(entry.title, {
        ...breakOptions,
        lineWidthMm: Math.max(10, folioXMm - gapMm),
      });

      lines = titles.map((line, index) => {
        const segments = [{ text: line.text }];

        if (index !== titles.length - 1) {
          return { ...line, segments };
        }

        const titleEndMm = (index === 0 ? indentMm : 0) + measureString(line.text);
        const leaderStartMm = titleEndMm + gapMm;
        const leaderEndMm = folioXMm - gapMm;
        const hasLeader = entry.leaders && leaderEndMm - leaderStartMm >= 0.5;

        return {
          ...line,
          segments,
          toc: {
            text: entry.label,
            xMm: folioXMm,
            widthMm: labelWidth,
            leaderStartMm: hasLeader ? leaderStartMm : null,
            leaderEndMm: hasLeader ? leaderEndMm : null,
            dotted: entry.leaders,
          },
        };
      });
    }
    if (lines.length === 0) {
      continue;
    }

    if (lines.some((line) => line.overflow)) {
      diagnostics.push({
        code: "LONG_WORD",
        severity: "warning",
        message:
          "Hay una palabra más ancha que el área de texto. Reduce el tamaño de letra, amplía la caja o activa el guionado.",
        sectionId: block.sectionId,
        blockId: block.id,
      });
    }

    // Un título no puede quedar solo al pie de una página: debe caber con
    // algunas líneas del bloque que le sigue.
    if (style.keepWithNext) {
      const needed = spaceBeforeMm + lines.length * lineHeight + minAtBottom * lineHeight;

      if (usedHeightMm + needed > heightMm && usedHeightMm > 0) {
        flushPage();
      }
    }

    let pending = lines;
    let isFirstChunk = true;

    /**
     * Líneas que caben teniendo en cuenta las notas que arrastran.
     *
     * No basta con dividir la altura entre el interlineado: una llamada puede
     * añadir varias líneas al pie y dejar sin sitio al texto que la contiene.
     */
    const capacityFor = (candidate: readonly LaidOutLine[], before: number): number => {
      let max = Math.min(
        candidate.length,
        Math.max(0, Math.floor((heightMm - usedHeightMm - before) / lineHeight)),
      );

      while (max > 0) {
        const notes = newFootnotesIn(candidate.slice(0, max));
        const added = footnoteHeight(notes);
        const after = max === candidate.length ? spaceAfterMm : 0;

        if (before + max * lineHeight + after + added <= heightMm - usedHeightMm) {
          return max;
        }

        max -= 1;
      }

      return 0;
    };

    while (pending.length > 0) {
      const before = isFirstChunk ? spaceBeforeMm : 0;
      const capacity = capacityFor(pending, before);

      if (capacity <= 0) {
        if (usedHeightMm > 0) {
          flushPage();
          continue;
        }

        // La línea cabe, pero su nota no: se conserva todo y se avisa. Es
        // preferible una nota que se sale del área a una nota que desaparece.
        if (before + lineHeight <= heightMm) {
          const first = pending.slice(0, 1);
          registerFootnotes(first);

          placeBlock(
            {
              id: block.id,
              kind: block.kind,
              style,
              lines: first.map(toLaidOutLine),
              spaceBeforeMm: before,
              spaceAfterMm: 0,
              sectionId: block.sectionId,
              sectionTitle: block.sectionTitle,
              startsChapter: block.startsChapter,
              firstOfSection: block.firstOfSection,
              continued: !isFirstChunk,
              firstLineIndentMm: isFirstChunk ? indentMm : 0,
              dropCapCharacter: isFirstChunk ? block.dropCapCharacter : undefined,
              dropCapIndentMm: isFirstChunk ? dropCapIndentMm : undefined,
              ...(isFirstChunk ? dropCapFields : {}),
            },
            before + lineHeight,
          );

          diagnostics.push({
            code: "FOOTNOTE_OVERFLOW",
            severity: "warning",
            message: `La nota ${first[0]?.segments?.find((segment) => segment.footnote)?.footnote?.number ?? ""} no cabe en la página con su llamada. Se ha conservado y la maqueta debe revisarse.`,
            page: pageIndex + 1,
            sectionId: block.sectionId,
            blockId: block.id,
          });

          pending = pending.slice(1);
          flushPage();
          isFirstChunk = false;
          continue;
        }

        // Ni una línea cabe en una página vacía: la maqueta es inviable.
        diagnostics.push({
          code: "OVERFLOW",
          severity: "error",
          message:
            "El área de texto no tiene altura suficiente para una sola línea con este tamaño de letra. Revisa los márgenes y el cuerpo.",
          page: pageIndex + 1,
          sectionId: block.sectionId,
          blockId: block.id,
        });
        break;
      }

      if (pending.length <= capacity) {
        registerFootnotes(pending);

        placeBlock(
          {
            id: block.id,
            kind: block.kind,
            style,
            lines: pending.map(toLaidOutLine),
            spaceBeforeMm: before,
            spaceAfterMm: spaceAfterMm,
            sectionId: block.sectionId,
            sectionTitle: block.sectionTitle,
            startsChapter: block.startsChapter,
            firstOfSection: block.firstOfSection,
            continued: !isFirstChunk,
            firstLineIndentMm: isFirstChunk ? indentMm : 0,
            dropCapCharacter: isFirstChunk ? block.dropCapCharacter : undefined,
            dropCapIndentMm: isFirstChunk ? dropCapIndentMm : undefined,
            ...(isFirstChunk ? dropCapFields : {}),
          },
          before + pending.length * lineHeight + spaceAfterMm,
        );
        pending = [];
        break;
      }

      // El bloque no cabe entero: hay que partirlo.
      if (capacity < minAtBottom && usedHeightMm > 0) {
        // Huérfana: quedan menos líneas de las mínimas al pie de la página.
        diagnostics.push({
          code: "ORPHAN",
          severity: "warning",
          message: `Quedarían ${capacity} ${capacity === 1 ? "línea" : "líneas"} del párrafo al pie de la página. Se ha movido el párrafo a la página siguiente.`,
          page: pageIndex + 1,
          sectionId: block.sectionId,
          blockId: block.id,
        });

        flushPage();
        continue;
      }

      let take = capacity;
      const rest = pending.length - take;

      if (rest > 0 && rest < minAtTop) {
        // Viuda: la continuación quedaría con muy pocas líneas arriba.
        take = Math.max(1, pending.length - minAtTop);
        diagnostics.push({
          code: "WIDOW",
          severity: "warning",
          message: `La continuación del párrafo quedaría con ${rest} ${rest === 1 ? "línea" : "líneas"} arriba. Se han repartido las líneas de otra manera.`,
          page: pageIndex + 1,
          sectionId: block.sectionId,
          blockId: block.id,
        });
      }

      registerFootnotes(pending.slice(0, take));

      placeBlock(
        {
          id: block.id,
          kind: block.kind,
          style,
          lines: pending.slice(0, take).map(toLaidOutLine),
          spaceBeforeMm: before,
          spaceAfterMm: 0,
          sectionId: block.sectionId,
          sectionTitle: block.sectionTitle,
          startsChapter: block.startsChapter,
          firstOfSection: block.firstOfSection,
          continued: !isFirstChunk,
          firstLineIndentMm: isFirstChunk ? indentMm : 0,
          dropCapCharacter: isFirstChunk ? block.dropCapCharacter : undefined,
          dropCapIndentMm: isFirstChunk ? dropCapIndentMm : undefined,
          ...(isFirstChunk ? dropCapFields : {}),
        },
        before + take * lineHeight,
      );

      pending = pending.slice(take);
      flushPage();
      isFirstChunk = false;
    }
  }

  if (currentBlocks.length > 0) {
    flushPage();
  }

  if (pages.length === 0) {
    flushPage(true);
  }

  return {
    pages,
    diagnostics,
    textWidthMm: widthMm,
    textHeightMm: heightMm,
  };
}

function toLaidOutLine(
  line: LineBreak & { segments?: InlineRun[]; toc?: TocFolioGeometry },
): LaidOutLine {
  return {
    text: line.text,
    hyphenated: line.hyphenated,
    overflow: line.overflow,
    ...(line.segments && line.segments.length > 0 ? { segments: line.segments } : {}),
    ...(line.toc ? { toc: line.toc } : {}),
  };
}

/**
 * Comprueba si un bloque de texto cabe en el área de texto.
 *
 * Sirve para avisar de que el tamaño de letra elegido deja un área de texto
 * demasiado estrecha para el contenido.
 */
export function fitsTextBlock(
  text: string,
  geometry: PageGeometry,
  typographyInput: unknown,
): { fits: boolean; widthMm: number; heightMm: number } {
  const typography = withTypographyDefaults(typographyInput ?? DEFAULT_TYPOGRAPHY_CONFIG);
  const { widthMm, heightMm } = textBlockSize(geometry);
  const style = typography.body;
  const textWidth = measureTextMm(text, {
    fontFamily: style.fontFamily,
    fontSizePt: style.fontSizePt,
    letterSpacingPt: style.letterSpacingPt,
  });

  return { fits: textWidth <= widthMm, widthMm, heightMm };
}
