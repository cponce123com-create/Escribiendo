import { measureTextMm, type MeasureOptions } from "./measure";

/**
 * Signos que no pueden ser la inicial capitular: comillas, paréntesis,
 * corchetes, rayas, puntos suspensivos y los signos de apertura del español.
 */
const OPENING_MARKS = new Set([
  "«",
  "»",
  '"',
  "'",
  "“",
  "”",
  "‘",
  "’",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "¿",
  "¡",
  "—",
  "–",
  "-",
  "…",
]);

/** Líneas que ocupa la inicial por defecto. */
export const DEFAULT_DROP_CAP_LINES = 3;

/** Líneas admitidas por la composición. */
export type DropCapLines = 2 | 3;

export interface DropCapStyle {
  fontFamily: MeasureOptions["fontFamily"];
  fontSizePt: number;
  letterSpacingPt: number;
  uppercase: boolean;
  bold: boolean;
}

export interface DropCapMetrics {
  /** Grafema que se compone como inicial. */
  character: string;
  /** Líneas de cuerpo que ocupa. */
  lines: DropCapLines;
  /** Cuerpo de la inicial, en puntos. */
  sizePt: number;
  /** Separación entre la inicial y el texto, en milímetros. */
  separationMm: number;
  /** Sangría que necesitan las líneas ocupadas por la inicial. */
  advanceMm: number;
}

/**
 * Primer grafema visible del párrafo, saltando la puntuación de apertura.
 *
 * Se recorre por grupos de grafemas (no por unidades UTF-16) para no partir
 * letras con diacríticos ni emoji, y se descartan las comillas y los signos
 * que nunca abren un párrafo con mayúscula inicial.
 */
export function dropCapGrapheme(text: string): string | null {
  const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" });

  for (const { segment } of segmenter.segment(text.trimStart())) {
    if (segment.trim().length === 0) {
      continue;
    }

    if (OPENING_MARKS.has(segment)) {
      continue;
    }

    return segment;
  }

  return null;
}

/** Geometría compartida de la inicial capitular. */
export function dropCapMetrics(
  character: string,
  style: DropCapStyle,
  lines: DropCapLines = DEFAULT_DROP_CAP_LINES,
  measure?: MeasureOptions["measure"],
): DropCapMetrics {
  const sizePt = style.fontSizePt * lines;
  const separationMm = (style.fontSizePt * 0.12 * 25.4) / 72;
  const advanceMm =
    measureTextMm(character, {
      fontFamily: style.fontFamily,
      fontSizePt: sizePt,
      letterSpacingPt: style.letterSpacingPt,
      uppercase: style.uppercase,
      bold: style.bold,
      ...(measure ? { measure } : {}),
    }) + separationMm;

  return { character, lines, sizePt, separationMm, advanceMm };
}

/** Normaliza el número de líneas admitido por la composición. */
export function normalizeDropCapLines(value: number | undefined): DropCapLines {
  return value === 2 ? 2 : DEFAULT_DROP_CAP_LINES;
}
