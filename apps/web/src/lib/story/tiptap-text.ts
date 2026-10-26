/**
 * Texto plano de un documento TipTap.
 *
 * Las secciones se guardan como JSON de TipTap; para buscar menciones o medir
 * apariciones solo interesa el texto. Se recorre el árbol en orden y se separan
 * los bloques con un espacio, de modo que dos palabras de párrafos distintos no
 * queden pegadas y produzcan una coincidencia falsa.
 */
export function tipTapToPlainText(value: unknown): string {
  if (!value || typeof value !== "object") return "";

  const node = value as { text?: unknown; content?: unknown[] };
  const own = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content)
    ? node.content.map(tipTapToPlainText).filter(Boolean).join(" ")
    : "";

  return [own, children].filter(Boolean).join(" ");
}
