/**
 * Utilidades lingüísticas para manuscritos narrativos en español.
 *
 * El motor recibe texto plano o el HTML/JSON que guarda el editor. Aquí se
 * normaliza y se conservan posiciones para poder citar el fragmento original.
 * No se envía nada a servicios externos.
 */

import { countWords, splitSpanishSentences } from "@escribiendo/book-schema";

export interface Sentence {
  text: string;
  start: number;
  end: number;
  index: number;
}

export interface TextToken {
  text: string;
  normalized: string;
  start: number;
  end: number;
  capitalized: boolean;
  sentenceIndex: number;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ü: "ü",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => HTML_ENTITIES[name] ?? match);
}

function extractJsonText(value: unknown): string {
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map(extractJsonText).join("");
  }

  if (!value || typeof value !== "object") return "";

  const node = value as Record<string, unknown>;

  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak" || node.type === "hard_break") return "\n";

  const children = Array.isArray(node.content) ? node.content : [];
  const blockTypes = new Set([
    "doc",
    "paragraph",
    "heading",
    "blockquote",
    "bulletList",
    "orderedList",
    "listItem",
    "codeBlock",
    "horizontalRule",
  ]);
  const inline = children.map(extractJsonText).join("");

  // Los bloques cierran con un salto; los nodos inline (texto, marcas,
  // hardBreak) nunca se separan entre sí con párrafos artificiales.
  if (typeof node.type === "string" && blockTypes.has(node.type)) {
    return `${inline}\n\n`;
  }

  return inline;
}

function normalizePlainText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convierte HTML, JSON de editor o texto plano a texto narrativo.
 * Los offsets que produce el motor son offsets de este texto normalizado.
 */
export function extractPlainText(content: string): string {
  if (!content) return "";

  const trimmed = content.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const jsonText = extractJsonText(parsed).trim();
      return normalizePlainText(jsonText);
    } catch {
      // No era JSON: se trata como HTML o texto.
    }
  }

  if (/<[a-z][\s\S]*>/i.test(content)) {
    const withoutScripts = content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");

    const withBreaks = withoutScripts
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/?(?:p|div|section|article|header|footer|h[1-6]|li|blockquote|tr)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<\/?(?:ul|ol|table|thead|tbody)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");

    return normalizePlainText(decodeHtmlEntities(withBreaks));
  }

  return normalizePlainText(decodeHtmlEntities(content));
}

/** Adaptador de compatibilidad hacia el segmentador compartido del paquete. */
export function splitSentences(text: string): Sentence[] {
  return splitSpanishSentences(text);
}

/** Elimina diacríticos, signos y mayúsculas para comparar nombres. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeComparable(value: string): string {
  return normalizeName(value);
}

export function isCapitalizedWord(value: string): boolean {
  return /^\p{Lu}/u.test(value);
}

export function tokenizeSentence(sentence: Sentence): TextToken[] {
  const tokens: TextToken[] = [];
  const regex = /\p{L}[\p{L}\p{M}'’.-]*/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence.text)) !== null) {
    const raw = match[0];
    const clean = raw.replace(/^[.'’-]+|[.'’-]+$/g, "");
    if (!clean) continue;

    const offset = match.index;
    const start = sentence.start + offset;
    tokens.push({
      text: clean,
      normalized: normalizeName(clean),
      start,
      end: start + clean.length,
      capitalized: isCapitalizedWord(clean),
      sentenceIndex: sentence.index,
    });
  }

  return tokens;
}

export function wordCount(text: string): number {
  return countWords(text);
}

function trimExcerpt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * Cita a partir de una frase ya segmentada. Evita volver a segmentar el
 * manuscrito por cada aparición.
 */
export function excerptFromSentence(
  sentence: Sentence,
  start: number,
  end: number,
  maxLength = 240,
): string {
  if (sentence.text.length <= maxLength) return trimExcerpt(sentence.text, maxLength);

  const relativeStart = Math.max(0, start - sentence.start);
  const relativeEnd = Math.max(relativeStart, end - sentence.start);
  const half = Math.floor((maxLength - (relativeEnd - relativeStart)) / 2);
  const from = Math.max(0, relativeStart - half);
  const to = Math.min(sentence.text.length, relativeEnd + half);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < sentence.text.length ? "…" : "";

  return `${prefix}${trimExcerpt(sentence.text.slice(from, to), maxLength)}${suffix}`;
}

/**
 * Devuelve una cita legible alrededor de una aparición. Si la frase es muy
 * larga se recorta, pero nunca se inventa texto.
 */
export function excerptAround(text: string, start: number, end: number, maxLength = 240): string {
  const sentence = splitSentences(text).find(
    (item) => item.start <= start && item.end >= Math.min(end, start + 1),
  );

  if (sentence) {
    if (sentence.text.length <= maxLength) return trimExcerpt(sentence.text, maxLength);

    const relativeStart = Math.max(0, start - sentence.start);
    const relativeEnd = Math.max(relativeStart, end - sentence.start);
    const half = Math.floor((maxLength - (relativeEnd - relativeStart)) / 2);
    const from = Math.max(0, relativeStart - half);
    const to = Math.min(sentence.text.length, relativeEnd + half);
    const prefix = from > 0 ? "…" : "";
    const suffix = to < sentence.text.length ? "…" : "";

    return `${prefix}${trimExcerpt(sentence.text.slice(from, to), maxLength)}${suffix}`;
  }

  const from = Math.max(0, start - Math.floor(maxLength / 2));
  const to = Math.min(text.length, end + Math.floor(maxLength / 2));
  return `${from > 0 ? "…" : ""}${trimExcerpt(text.slice(from, to), maxLength)}${to < text.length ? "…" : ""}`;
}

/** Clave estable para relacionar sugerencias con una ficha, sin depender del nombre visible. */
export function stableKey(value: string): string {
  const normalized = normalizeName(value) || "personaje";
  const slug = normalized.slice(0, 48).replace(/\s+/g, "-");

  let hash = 2_166_136_261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `${slug}-${(hash >>> 0).toString(36)}`;
}

export function splitNameTokens(value: string): string[] {
  return normalizeName(value).split(" ").filter(Boolean);
}

export function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) =>
      part.length > 2 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}` : part,
    )
    .join(" ");
}
