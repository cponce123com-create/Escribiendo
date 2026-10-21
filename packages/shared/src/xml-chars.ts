/**
 * Caracteres que XML no admite.
 *
 * El EPUB y el DOCX son documentos XML: un solo carácter de control —por
 * ejemplo U+0007— hace que el archivo entero sea inválido y que EPUBCheck lo
 * declare corrupto. El manuscrito se valida aquí, antes de guardarse, y los
 * escritores limpian el texto por si acaso.
 *
 * XML 1.0 permite el tabulador, el salto de línea y el retorno de carro, y
 * cualquier carácter de U+0020 en adelante.
 */
const CONTROLES_ILEGALES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu;

/** Indica si el texto tiene algún carácter que XML no permite. */
export function tieneControlesIlegales(text: string): boolean {
  CONTROLES_ILEGALES.lastIndex = 0;

  return CONTROLES_ILEGALES.test(text);
}

/** Quita los caracteres que XML no admite, sin tocar tabuladores ni saltos. */
export function limpiaControles(text: string): string {
  CONTROLES_ILEGALES.lastIndex = 0;

  return text.replace(CONTROLES_ILEGALES, "");
}
