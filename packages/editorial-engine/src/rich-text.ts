import {
  breakIntoLines,
  measureTextMm,
  type BreakOptions,
  type LineBreak,
  type MeasureOptions,
} from "./measure";

/**
 * Texto con formato en línea.
 *
 * El motor de maquetación no sabe nada de Tiptap ni de HTML: recibe tramos de
 * texto con sus marcas (negrita, cursiva, subrayado…) y los compone. La
 * conversión desde el documento vive en la aplicación, que es donde se conoce
 * el formato de origen.
 *
 * Las marcas se aplican al tramo entero, no carácter a carácter: así un
 * párrafo sin formato se compone con el mismo camino rápido de siempre y uno
 * con dos negritas no obliga a recorrer cada letra.
 */

export interface InlineMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  /** Texto de código en línea: se compone en monoespaciada. */
  code?: boolean;
  /** Dirección de un enlace. */
  link?: string;
}

/** Referencia a una nota al pie, con su número y su texto. */
export interface InlineFootnote {
  id: string;
  number: number;
  note: string;
}

export interface InlineRun {
  text: string;
  marks?: InlineMarks;
  /** Si el tramo es una llamada a nota al pie, conserva su identidad y texto. */
  footnote?: InlineFootnote;
}

/** Una línea compuesta, con sus tramos y sus marcas. */
export interface RichLine extends LineBreak {
  segments: InlineRun[];
}

/** Palabra con formato, unidad de reparto del párrafo. */
interface RichWord {
  text: string;
  segments: InlineRun[];
}

/** Indica si algún tramo lleva formato. */
export function hasInlineMarks(runs: readonly InlineRun[]): boolean {
  return runs.some((run) => {
    const marks = run.marks;

    if (!marks) {
      return false;
    }

    return Boolean(
      marks.bold ||
      marks.italic ||
      marks.underline ||
      marks.strike ||
      marks.superscript ||
      marks.subscript ||
      marks.code ||
      marks.link,
    );
  });
}

/** Une los tramos de un run en texto plano. */
export function runsToText(runs: readonly InlineRun[]): string {
  return runs.map((run) => run.text).join("");
}

/** Recorta los tramos por desplazamientos de carácter. */
function sliceRuns(runs: readonly InlineRun[], start: number, end: number): InlineRun[] {
  const result: InlineRun[] = [];
  let position = 0;

  for (const run of runs) {
    const runStart = position;
    const runEnd = position + run.text.length;
    position = runEnd;

    if (runEnd <= start || runStart >= end) {
      continue;
    }

    const from = Math.max(start, runStart) - runStart;
    const to = Math.min(end, runEnd) - runStart;

    if (to > from) {
      result.push({
        text: run.text.slice(from, to),
        marks: run.marks,
        ...(run.footnote ? { footnote: run.footnote } : {}),
      });
    }
  }

  return result;
}

/** Convierte los tramos en palabras, conservando sus marcas. */
function toWords(runs: readonly InlineRun[]): RichWord[] {
  const words: RichWord[] = [];
  let current: InlineRun[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      words.push({
        text: runsToText(current),
        segments: current,
      });
      current = [];
    }
  };

  for (const run of runs) {
    if (run.text.length === 0) {
      continue;
    }

    for (const part of run.text.split(/(\s+)/u)) {
      if (part.length === 0) {
        continue;
      }

      if (/^\s+$/u.test(part)) {
        flush();
        continue;
      }

      current.push({
        text: part,
        marks: run.marks,
        ...(run.footnote ? { footnote: run.footnote } : {}),
      });
    }
  }

  flush();

  return words;
}

/**
 * Tamaño efectivo de un tramo.
 *
 * Las llamadas a nota y los superíndices se componen al 72 % del cuerpo; si se
 * midieran al tamaño completo, la línea se daría por llena antes de tiempo.
 */
function segmentFontSizePt(segment: InlineRun, options: MeasureOptions): number {
  return segment.marks?.superscript || segment.marks?.subscript
    ? options.fontSizePt * 0.72
    : options.fontSizePt;
}

/** Ancho de una palabra con formato, en milímetros. */
function wordWidth(word: RichWord, options: MeasureOptions): number {
  let total = 0;

  for (const segment of word.segments) {
    total += measureTextMm(segment.text, {
      ...options,
      fontSizePt: segmentFontSizePt(segment, options),
      bold: options.bold === true || segment.marks?.bold === true,
    });
  }

  return total;
}

/** Une las palabras de una línea en sus tramos definitivos. */
function joinWords(words: readonly RichWord[]): { text: string; segments: InlineRun[] } {
  const segments: InlineRun[] = [];

  words.forEach((word, index) => {
    if (index > 0) {
      segments.push({ text: " " });
    }

    for (const segment of word.segments) {
      segments.push(segment);
    }
  });

  return { text: runsToText(segments), segments };
}

/**
 * Parte una palabra con formato en el fragmento más largo que cabe.
 *
 * Solo corta por un guion ya existente, igual que el reparto sin formato: no
 * inventa divisiones silábicas.
 */
function splitWordToFit(
  word: RichWord,
  widthMm: number,
  options: MeasureOptions,
): { head: RichWord; tail: RichWord } | null {
  const separators = /[-‐‑–—/]/gu;
  const headRuns: InlineRun[] = [];
  const headText: string[] = [];
  let best: number | null = null;
  let match: RegExpExecArray | null;

  separators.lastIndex = 0;

  while ((match = separators.exec(word.text)) !== null) {
    const end = match.index + 1;
    const candidate = sliceRuns(word.segments, 0, end);

    if (measureSegments(candidate, options) <= widthMm) {
      best = end;
      headRuns.splice(0, headRuns.length, ...candidate);
      headText.splice(0, headText.length, word.text.slice(0, end));
    } else {
      break;
    }
  }

  if (best === null) {
    return null;
  }

  const head: RichWord = {
    text: headText.join(""),
    segments: headRuns,
  };
  const tail: RichWord = {
    text: word.text.slice(best),
    segments: sliceRuns(word.segments, best, word.text.length),
  };

  return { head, tail };
}

/** Ancho de una lista de tramos, en milímetros. */
function measureSegments(segments: readonly InlineRun[], options: MeasureOptions): number {
  let total = 0;

  for (const segment of segments) {
    total += measureTextMm(segment.text, {
      ...options,
      fontSizePt: segmentFontSizePt(segment, options),
      bold: options.bold === true || segment.marks?.bold === true,
    });
  }

  return total;
}

/**
 * Parte un párrafo con formato en líneas.
 *
 * Replica el mismo reparto codicioso que el texto sin formato, con una
 * diferencia: mide cada tramo con su estilo, de modo que una negrita ancha
 * cuenta lo que ocupa. Cuando el párrafo no lleva ninguna marca, delega en el
 * camino rápido para no pagar el coste de trocear los tramos.
 */
export function breakRunsIntoLines(runs: readonly InlineRun[], options: BreakOptions): RichLine[] {
  if (!hasInlineMarks(runs)) {
    const text = runsToText(runs);

    return breakIntoLines(text, options).map((line) => ({
      ...line,
      segments: [{ text: line.text }],
    }));
  }

  const words = toWords(runs);

  if (words.length === 0) {
    return [];
  }

  const lines: RichLine[] = [];
  const hyphenation = options.hyphenation ?? false;
  const spaceWidth = measureTextMm(" ", options);

  let current: RichWord[] = [];
  let currentWidth = 0;
  let isFirstLine = true;

  const availableWidth = (): number => {
    const indent = isFirstLine ? (options.firstLineIndentMm ?? 0) : 0;
    return options.lineWidthMm - indent;
  };

  const pushLine = (wordsInLine: RichWord[], overflow: boolean, hyphenated: boolean): void => {
    const joined = joinWords(wordsInLine);

    lines.push({
      text: joined.text,
      segments: joined.segments,
      overflow,
      hyphenated,
    });

    current = [];
    currentWidth = 0;
    isFirstLine = false;
  };

  for (const word of words) {
    const width = wordWidth(word, options);
    const separator = current.length > 0 ? spaceWidth : 0;

    if (currentWidth + separator + width <= availableWidth()) {
      current.push(word);
      currentWidth += separator + width;
      continue;
    }

    if (current.length > 0) {
      pushLine(current, false, false);
    }

    if (width <= availableWidth()) {
      current.push(word);
      currentWidth = width;
      continue;
    }

    if (hyphenation) {
      const fragment = splitWordToFit(word, availableWidth(), options);

      if (fragment) {
        current.push(fragment.head);
        pushLine(current, false, true);

        const restWidth = wordWidth(fragment.tail, options);

        if (restWidth <= availableWidth()) {
          current = [fragment.tail];
          currentWidth = restWidth;
        } else {
          const second = splitWordToFit(fragment.tail, availableWidth(), options);

          if (second) {
            current = [second.head];
            currentWidth = wordWidth(second.head, options);
          } else {
            pushLine([fragment.tail], true, false);
          }
        }

        continue;
      }
    }

    pushLine([word], true, false);
  }

  if (current.length > 0) {
    pushLine(current, false, false);
  }

  return lines;
}
