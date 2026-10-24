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

/** Resultado de extraer la inicial de una línea. */
export interface DropCapExtraction<T> {
  /** Tramos sin el grafema de la inicial; el resto del texto queda intacto. */
  segments: T[];
  /** `false` si el grafema no aparece en la línea (no se debe dibujar aparte). */
  removed: boolean;
}

/**
 * Quita de la primera línea exactamente el grafema que se dibuja como inicial.
 *
 * No se elimina «el primer grafema»: con `«Aquella`, `—¿Quién…?` o `“Había”`
 * el primero es puntuación y debe conservarse. Se busca el grafema elegido por
 * `dropCapGrapheme` y se elimina solo esa aparición, respetando los tramos con
 * formato y las marcas combinadas.
 */
export function extractDropCapGrapheme<T extends { text: string }>(
  segments: readonly T[],
  character: string,
): DropCapExtraction<T> {
  const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" });
  const result: T[] = [];
  let removed = false;

  for (const segment of segments) {
    if (removed || segment.text.length === 0) {
      result.push(segment);
      continue;
    }

    const parts = [...segmenter.segment(segment.text)];
    const index = parts.findIndex((part) => part.segment === character);

    if (index < 0) {
      result.push(segment);
      continue;
    }

    removed = true;
    const before = parts
      .slice(0, index)
      .map((part) => part.segment)
      .join("");
    const after = parts
      .slice(index + 1)
      .map((part) => part.segment)
      .join("");

    const remaining = `${before}${after}`;

    if (remaining.length > 0) {
      result.push({ ...segment, text: remaining });
    }
  }

  return removed
    ? { segments: result, removed: true }
    : { segments: segments.map((segment) => ({ ...segment })), removed: false };
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
