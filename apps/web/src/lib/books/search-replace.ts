import type { TiptapDocument, TiptapNode } from "@escribiendo/book-schema";

/**
 * Búsqueda y reemplazo sobre el contenido de las secciones.
 *
 * Solo se tocan los nodos de texto: la estructura, las marcas y los atributos
 * (notas al pie, imágenes, notas al margen) quedan intactos. La búsqueda es
 * siempre es literal: nunca se ejecutan expresiones aportadas por el usuario.
 */

export const MAX_QUERY_LENGTH = 200;
export const MAX_MATCHES = 5_000;
export const MAX_EXCERPTS_PER_SECTION = 3;

const BACKSLASH = String.fromCharCode(92);
const WORD_CHAR = `${BACKSLASH}p{L}${BACKSLASH}p{N}`;
const WHITESPACE_RUN = new RegExp(`${BACKSLASH}s+`, "gu");

const REGEX_SPECIALS = new Set([
  ".",
  "*",
  "+",
  "?",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  BACKSLASH,
]);

export interface SearchReplaceOptions {
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface MatchExcerpt {
  before: string;
  match: string;
  after: string;
}

export interface DocumentSearchResult {
  count: number;
  excerpts: MatchExcerpt[];
  truncated: boolean;
}

export interface DocumentReplaceResult {
  document: TiptapDocument;
  replacements: number;
}

export type PatternResult = { ok: true; pattern: RegExp } | { ok: false; error: string };

function escapeRegExp(value: string): string {
  return [...value]
    .map((char) => (REGEX_SPECIALS.has(char) ? `${BACKSLASH}${char}` : char))
    .join("");
}

/** Compila la búsqueda; devuelve un error legible si no es válida. */
export function buildSearchPattern(options: SearchReplaceOptions): PatternResult {
  const query = options.query;

  if (query.trim().length === 0) {
    return { ok: false, error: "Escribe el texto que quieres buscar." };
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `La búsqueda no puede superar los ${MAX_QUERY_LENGTH} caracteres.` };
  }

  if (options.regex) {
    return {
      ok: false,
      error: "Las expresiones regulares no están disponibles. Usa una búsqueda literal.",
    };
  }

  let source = escapeRegExp(query);

  if (options.wholeWord) {
    source = `(?<![${WORD_CHAR}])${source}(?![${WORD_CHAR}])`;
  }

  try {
    return {
      ok: true,
      pattern: new RegExp(source, options.caseSensitive ? "gu" : "giu"),
    };
  } catch {
    return { ok: false, error: "La expresión regular no es válida." };
  }
}

function clone(pattern: RegExp): RegExp {
  return new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
}

function excerptAround(text: string, start: number, end: number): MatchExcerpt {
  const before = text.slice(Math.max(0, start - 70), start);
  const after = text.slice(end, Math.min(text.length, end + 70));

  return {
    before: before.replace(WHITESPACE_RUN, " ").trimStart(),
    match: text.slice(start, end),
    after: after.replace(WHITESPACE_RUN, " ").trimEnd(),
  };
}

/** Cuenta coincidencias y recoge extractos sin modificar el documento. */
export function searchDocument(
  document: TiptapDocument,
  pattern: RegExp,
  options: { maxMatches?: number; maxExcerpts?: number } = {},
): DocumentSearchResult {
  const maxMatches = options.maxMatches ?? MAX_MATCHES;
  const maxExcerpts = options.maxExcerpts ?? MAX_EXCERPTS_PER_SECTION;
  const excerpts: MatchExcerpt[] = [];
  let count = 0;
  let truncated = false;

  const visit = (node: TiptapNode): void => {
    if (truncated) {
      return;
    }

    if (typeof node.text === "string" && node.text.length > 0) {
      for (const match of node.text.matchAll(clone(pattern))) {
        if (count >= maxMatches) {
          truncated = true;
          return;
        }

        count += 1;

        if (excerpts.length < maxExcerpts) {
          const start = match.index ?? 0;
          excerpts.push(excerptAround(node.text, start, start + match[0].length));
        }
      }
    }

    for (const child of node.content ?? []) {
      visit(child);
    }
  };

  visit(document);

  return { count, excerpts, truncated };
}

/**
 * Reemplaza en los nodos de texto y devuelve un documento nuevo.
 *
 * El reemplazo se inserta siempre tal cual, sin interpretar referencias `$1`.
 */
export function replaceDocument(
  document: TiptapDocument,
  pattern: RegExp,
  replacement: string,
  _options: { literal: boolean },
): DocumentReplaceResult {
  let replacements = 0;

  const replaceText = (text: string): string => {
    const matches = [...text.matchAll(clone(pattern))].length;

    if (matches === 0) {
      return text;
    }

    replacements += matches;

    return text.replace(clone(pattern), () => replacement);
  };

  const transform = (node: TiptapNode): TiptapNode => {
    if (typeof node.text === "string") {
      const text = replaceText(node.text);
      return text === node.text ? node : { ...node, text };
    }

    if (!node.content) {
      return node;
    }

    let changed = false;
    const content = node.content.map((child) => {
      const next = transform(child);

      if (next !== child) {
        changed = true;
      }

      return next;
    });

    return changed ? { ...node, content } : node;
  };

  return { document: transform(document) as TiptapDocument, replacements };
}
