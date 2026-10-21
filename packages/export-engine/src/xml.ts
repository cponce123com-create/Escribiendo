/**
 * Utilidades de XML para el EPUB y el DOCX.
 *
 * Los dos formatos son XML: el texto que sale del manuscrito tiene que quedar
 * dentro de un documento que se pueda parsear. Un solo carácter de control
 * —por ejemplo U+0007— hace que EPUBCheck declare el EPUB entero como
 * inválido, así que aquí se quitan. El filtrado de caracteres y el de
 * enlaces viven en el paquete compartido, que es donde se usan también para
 * validar lo que se guarda.
 */

import { esEnlaceSeguro, limpiaControles } from "@escribiendo/shared";

export { esEnlaceSeguro, limpiaControles };

/** Escapa el texto para meterlo en un documento XML. */
export function escapeXml(text: string): string {
  return limpiaControles(text)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
