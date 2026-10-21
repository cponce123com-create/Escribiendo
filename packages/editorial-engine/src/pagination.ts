import {
  computeImageLayout,
  IMAGE_CAPTION_SCALE,
  type EditorialImage,
  type ImageLayout,
} from "./image";
import { breakIntoLines, measureTextMm, type LineBreak } from "./measure";
import { breakRunsIntoLines, type InlineRun } from "./rich-text";
import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  withTypographyDefaults,
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
  | "body"
  | "firstParagraph"
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
  /** Referencia de la imagen, cuando `kind` es `image`. */
  image?: EditorialImage;
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
    | "CHAPTER_NOT_ON_RECTO";
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
  /** Imagen y su caja compuesta, cuando el bloque es una imagen. */
  image?: EditorialImage;
  imageLayout?: ImageLayout;
}

export interface LaidOutPage {
  /** Número de página, contando desde 1. */
  index: number;
  /** Folio impreso. */
  folio: number;
  /** `recto` es la página derecha (impar), `verso` la izquierda. */
  side: "recto" | "verso";
  blocks: LaidOutBlock[];
  /** Altura ocupada en la página, en milímetros. */
  usedHeightMm: number;
  /** Altura disponible, en milímetros. */
  totalHeightMm: number;
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

function toMm(points: number): number {
  return points * POINTS_TO_MM;
}

function styleFor(config: TypographyConfig, kind: LayoutBlockKind): TypographyStyle {
  switch (kind) {
    case "heading1":
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
  let currentRunningHead: string | null = null;
  let pageIndex = 0;

  const pageSide = (index: number): "recto" | "verso" =>
    (index - 1) % 2 === 0 ? "recto" : "verso";

  const flushPage = (blank = false): void => {
    pageIndex += 1;

    pages.push({
      index: pageIndex,
      folio: firstPageNumber + pageIndex - 1,
      side: pageSide(pageIndex),
      blocks: currentBlocks,
      usedHeightMm,
      totalHeightMm: heightMm,
      runningHead: blank ? null : currentRunningHead,
      blank,
    });

    currentBlocks = [];
    usedHeightMm = 0;
  };

  const placeBlock = (block: LaidOutBlock, height: number): void => {
    currentBlocks.push(block);
    usedHeightMm += height;
  };

  for (const block of blocks) {
    if (block.startsChapter && chapterStartsRecto) {
      // El capítulo debe abrir en página par (la derecha). Si la página
      // actual es izquierda, se inserta una en blanco.
      const nextSide = pageSide(pageIndex + 1);

      if (nextSide === "verso") {
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

    const style = styleFor(typography, block.kind);
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

    const breakOptions = {
      fontFamily: style.fontFamily,
      fontSizePt: style.fontSizePt,
      letterSpacingPt: style.letterSpacingPt,
      uppercase: style.uppercase,
      smallCaps: style.smallCaps,
      lineWidthMm: widthMm,
      firstLineIndentMm: indentMm,
      hyphenation: style.hyphenation,
      // Los títulos se componen en negrita: si se midieran como redonda, la
      // línea cabría en el cálculo y se saldría en el papel.
      bold: block.kind.startsWith("heading"),
    };

    const lines: LaidOutLine[] =
      block.runs && block.runs.length > 0
        ? breakRunsIntoLines(block.runs, breakOptions)
        : breakIntoLines(block.text, breakOptions).map((line) => ({
            ...line,
            segments: [{ text: line.text }],
          }));

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

    while (pending.length > 0) {
      const before = isFirstChunk ? spaceBeforeMm : 0;
      const capacity = Math.floor((heightMm - usedHeightMm - before) / lineHeight);

      if (capacity <= 0) {
        if (usedHeightMm > 0) {
          flushPage();
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
        take = pending.length - minAtTop;
        diagnostics.push({
          code: "WIDOW",
          severity: "warning",
          message: `La continuación del párrafo quedaría con ${rest} ${rest === 1 ? "línea" : "líneas"} arriba. Se han repartido las líneas de otra manera.`,
          page: pageIndex + 1,
          sectionId: block.sectionId,
          blockId: block.id,
        });
      }

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

function toLaidOutLine(line: LineBreak & { segments?: InlineRun[] }): LaidOutLine {
  return {
    text: line.text,
    hyphenated: line.hyphenated,
    overflow: line.overflow,
    ...(line.segments && line.segments.length > 0 ? { segments: line.segments } : {}),
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
