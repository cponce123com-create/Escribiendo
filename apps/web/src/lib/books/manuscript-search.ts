import type { TiptapDocument } from "@escribiendo/book-schema";

export interface ManuscriptMatch {
  sectionId: string;
  sectionTitle: string;
  count: number;
  excerpt: string;
}

interface TextLeaf {
  type: "text";
  text: string;
  marks?: Array<Record<string, unknown>>;
}

function isTextLeaf(value: unknown): value is TextLeaf {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.type === "text" && typeof record.text === "string";
}

/** Busca coincidencias literales sin distinguir mayúsculas en los nodos de texto. */
export function findTextMatches(value: unknown, query: string): number {
  const normalized = query.trim().toLocaleLowerCase("es");
  if (!normalized) return 0;
  if (isTextLeaf(value)) {
    return value.text.toLocaleLowerCase("es").split(normalized).length - 1;
  }
  if (Array.isArray(value))
    return value.reduce((sum, child) => sum + findTextMatches(child, query), 0);
  if (typeof value === "object" && value !== null) {
    return findTextMatches((value as Record<string, unknown>).content, query);
  }
  return 0;
}

/** Crea un extracto breve del contenido estructurado de Tiptap. */
export function excerptForQuery(value: unknown, query: string): string {
  const fragments: string[] = [];
  const visit = (node: unknown): void => {
    if (isTextLeaf(node)) fragments.push(node.text);
    else if (Array.isArray(node)) node.forEach(visit);
    else if (typeof node === "object" && node !== null)
      visit((node as Record<string, unknown>).content);
  };
  visit(value);
  const text = fragments.join(" ").replace(/\s+/g, " ").trim();
  const offset = text.toLocaleLowerCase("es").indexOf(query.trim().toLocaleLowerCase("es"));
  if (offset < 0) return text.slice(0, 140);
  return `${offset > 24 ? "…" : ""}${text.slice(Math.max(0, offset - 24), offset + query.length + 72)}${offset + query.length + 72 < text.length ? "…" : ""}`;
}

/** Reemplaza texto en nodos Tiptap y conserva sus marcas, atributos y estructura. */
export function replaceTextLeaves(
  document: TiptapDocument,
  search: string,
  replacement: string,
): { document: TiptapDocument; count: number } {
  const normalized = search.trim().toLocaleLowerCase("es");
  if (!normalized) return { document, count: 0 };
  let count = 0;
  const transform = (value: unknown): unknown => {
    if (isTextLeaf(value)) {
      const segments = value.text.split(new RegExp(escapeRegExp(search.trim()), "gi"));
      const found = segments.length - 1;
      count += found;
      return { ...value, text: segments.join(replacement) };
    }
    if (Array.isArray(value)) return value.map(transform);
    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(record).map(([key, child]) => [key, transform(child)]),
      );
    }
    return value;
  };
  return { document: transform(document) as TiptapDocument, count };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
