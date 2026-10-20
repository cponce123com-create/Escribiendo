/**
 * Comparación de dos versiones de un manuscrito.
 *
 * El diff es por palabras, no por caracteres: en un texto editorial lo
 * relevante es qué palabras se han añadido, quitado o cambiado, no la
 * posición exacta de cada letra.
 */

export type DiffOperation = "equal" | "insert" | "delete";

export interface DiffSegment {
  type: DiffOperation;
  text: string;
}

/**
 * Límite de palabras por versión. Por encima de este valor el coste del
 * algoritmo cuadrático deja de ser aceptable y se devuelve una sustitución
 * completa, que sigue siendo información útil.
 */
const MAX_DIFF_WORDS = 4_000;

/** Trocea el texto en palabras, conservando los espacios como separadores. */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/u).filter((part) => part.length > 0);
}

/** Compara dos secuencias y devuelve la matriz de longitudes comunes. */
function longestCommonSubmatrix(left: string[], right: string[]): number[][] {
  const matrix: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const row = matrix[i];
      const nextRow = matrix[i + 1];

      if (!row || !nextRow) {
        continue;
      }

      row[j] =
        left[i] === right[j]
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  return matrix;
}

/** Funde segmentos contiguos del mismo tipo. */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];

  for (const segment of segments) {
    const last = merged[merged.length - 1];

    if (last && last.type === segment.type) {
      last.text += segment.text;
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

/**
 * Calcula la diferencia entre dos versiones del texto.
 *
 * Devuelve una lista de segmentos con el texto común, el eliminado y el
 * añadido, en orden de lectura.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before.length > 0 ? [{ type: "equal", text: before }] : [];
  }

  const left = splitWords(before);
  const right = splitWords(after);

  if (left.length > MAX_DIFF_WORDS || right.length > MAX_DIFF_WORDS) {
    return [
      { type: "delete", text: before },
      { type: "insert", text: after },
    ];
  }

  const matrix = longestCommonSubmatrix(left, right);
  const segments: DiffSegment[] = [];

  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    const leftPart = left[i];
    const rightPart = right[j];

    if (leftPart === rightPart) {
      segments.push({ type: "equal", text: leftPart ?? "" });
      i += 1;
      j += 1;
      continue;
    }

    const down = matrix[i + 1]?.[j] ?? 0;
    const right_ = matrix[i]?.[j + 1] ?? 0;

    if (down >= right_) {
      segments.push({ type: "delete", text: leftPart ?? "" });
      i += 1;
      continue;
    }

    segments.push({ type: "insert", text: rightPart ?? "" });
    j += 1;
  }

  while (i < left.length) {
    segments.push({ type: "delete", text: left[i] ?? "" });
    i += 1;
  }

  while (j < right.length) {
    segments.push({ type: "insert", text: right[j] ?? "" });
    j += 1;
  }

  return mergeSegments(segments);
}

/** Resumen de los cambios: cuántas palabras se han añadido y quitado. */
export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

function countWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0;
}

/** Resume los cambios de un diff. */
export function summarizeDiff(segments: DiffSegment[]): DiffSummary {
  return segments.reduce<DiffSummary>(
    (summary, segment) => {
      const words = countWords(segment.text);

      if (segment.type === "insert") {
        summary.added += words;
      } else if (segment.type === "delete") {
        summary.removed += words;
      } else {
        summary.unchanged += words;
      }

      return summary;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}
