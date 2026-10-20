/**
 * Cálculo del progreso de escritura.
 *
 * La columna `books.writingProgress` está limitada entre 0 y 100 por una
 * restricción `CHECK` en la base de datos, así que el resultado se acota
 * siempre, incluso con una extensión por encima del objetivo.
 */

/** Redondea a dos decimales sin depender de la configuración regional. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Porcentaje de avance sobre el objetivo de palabras.
 *
 * Sin objetivo declarado no hay forma objetiva de medir el avance, así que
 * el progreso es cero hasta que se fije uno.
 */
export function computeWritingProgress(wordCount: number, targetWordCount: number | null): number {
  if (targetWordCount === null || targetWordCount <= 0) {
    return 0;
  }

  if (wordCount <= 0) {
    return 0;
  }

  return Math.min(100, round2((wordCount / targetWordCount) * 100));
}

/** Palabras que faltan para alcanzar el objetivo, o `null` si no hay objetivo. */
export function remainingWords(wordCount: number, targetWordCount: number | null): number | null {
  if (targetWordCount === null || targetWordCount <= 0) {
    return null;
  }

  return Math.max(0, targetWordCount - wordCount);
}
