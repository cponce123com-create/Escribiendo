import type { TiptapDocument, TiptapNode } from "../tiptap";

export type TiptapTextBlockType = "paragraph" | "heading" | "codeBlock";

export interface TiptapTextBlock {
  type: TiptapTextBlockType;
  headingLevel?: number;
  paragraphIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  isDialogue: boolean;
}

export interface SpanishSentence {
  text: string;
  start: number;
  end: number;
  index: number;
}

const SPANISH_ABBREVIATIONS = new Set([
  "sr",
  "sra",
  "srta",
  "dr",
  "dra",
  "lic",
  "prof",
  "profa",
  "ing",
  "arq",
  "cap",
  "gral",
  "tte",
  "sarg",
  "av",
  "num",
  "núm",
  "pág",
  "pag",
  "vol",
  "art",
  "ud",
  "uds",
  "ee",
  "uu",
  "a.c",
  "d.c",
]);

const VARIABLE_ABBREVIATIONS = new Set(["etc", "ej", "aprox", "vs", "p"]);
const CLOSING_PUNCTUATION = new Set(['"', "'", "”", "’", "»", ")", "]", "}"]);
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’.,-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
const TEXT_BLOCK_TYPES = new Set(["paragraph", "heading", "codeBlock"]);
const CONTAINER_NODE_TYPES = new Set([
  ...TEXT_BLOCK_TYPES,
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
]);

/** Normalización canónica, sin quitar tildes ni cambiar el texto fuente. */
export function normalizeSpanishText(value: string): string {
  return value.normalize("NFC");
}

/** Clave de comparación en español: NFC y minúsculas, conserva diacríticos. */
export function normalizeSpanishForComparison(value: string): string {
  return normalizeSpanishText(value).toLocaleLowerCase("es");
}

/** Tokeniza texto fuente y conserva rangos UTF-16 del texto original. */
export function tokenizeSpanishText(
  value: string,
  baseOffset = 0,
): Array<{
  text: string;
  normalized: string;
  startOffset: number;
  endOffset: number;
  capitalized: boolean;
}> {
  const tokens: Array<{
    text: string;
    normalized: string;
    startOffset: number;
    endOffset: number;
    capitalized: boolean;
  }> = [];

  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const text = match[0];
    const localStart = match.index;
    if (text === undefined || localStart === undefined) continue;

    const firstCharacter = Array.from(text)[0] ?? "";
    tokens.push({
      text,
      normalized: normalizeSpanishForComparison(text),
      startOffset: baseOffset + localStart,
      endOffset: baseOffset + localStart + text.length,
      capitalized: /^\p{Lu}/u.test(firstCharacter),
    });
  }

  return tokens;
}

export function countSpanishWords(value: string): number {
  return tokenizeSpanishText(value).length;
}

/**
 * Divide una línea en oraciones españolas sin transformar los offsets de origen.
 * Las posiciones devueltas son índices UTF-16 relativos a `text`.
 */
export function splitSpanishSentences(text: string): SpanishSentence[] {
  const sentences: SpanishSentence[] = [];
  let sentenceStart = 0;
  let sentenceIndex = 0;

  const pushSentence = (from: number, to: number): void => {
    let start = from;
    let end = to;
    while (start < end && /\s/u.test(text[start] ?? "")) start += 1;
    while (end > start && /\s/u.test(text[end - 1] ?? "")) end -= 1;
    if (end <= start) return;

    const sentenceText = text.slice(start, end);
    if (!/[\p{L}\p{N}]/u.test(sentenceText)) return;
    sentences.push({ text: sentenceText, start, end, index: sentenceIndex });
    sentenceIndex += 1;
  };

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === "\n") {
      pushSentence(sentenceStart, cursor);
      sentenceStart = cursor + 1;
      continue;
    }
    if (character === undefined || !".!?…".includes(character)) continue;

    let punctuationEnd = cursor + 1;
    while (punctuationEnd < text.length && ".!?…".includes(text[punctuationEnd] ?? "")) {
      punctuationEnd += 1;
    }

    let endWithClosing = punctuationEnd;
    while (endWithClosing < text.length && CLOSING_PUNCTUATION.has(text[endWithClosing] ?? "")) {
      endWithClosing += 1;
    }

    let next = endWithClosing;
    while (next < text.length && /\s/u.test(text[next] ?? "")) next += 1;

    const previousWord = /([\p{L}\p{M}]+)$/u
      .exec(text.slice(Math.max(sentenceStart, cursor - 32), cursor))?.[1]
      ?.normalize("NFC")
      .toLocaleLowerCase("es");
    const nextCodePoint =
      next < text.length ? String.fromCodePoint(text.codePointAt(next) ?? 0) : "";
    const nextIsUpperOrNumber = /^[\p{Lu}\p{N}¿¡"“«—–]/u.test(nextCodePoint);
    const nextIsLower = /^\p{Ll}/u.test(nextCodePoint);
    const isDecimal =
      character === "." && /\d/u.test(text[cursor - 1] ?? "") && /\d/u.test(text[cursor + 1] ?? "");
    const isInitial =
      character === "." &&
      previousWord !== undefined &&
      Array.from(previousWord).length === 1 &&
      nextIsUpperOrNumber;
    const isStandardAbbreviation =
      character === "." && previousWord !== undefined && SPANISH_ABBREVIATIONS.has(previousWord);
    const isVariableAbbreviation =
      character === "." &&
      previousWord !== undefined &&
      VARIABLE_ABBREVIATIONS.has(previousWord) &&
      nextIsLower;
    const isDialogueTag =
      next < text.length &&
      /[—–]/u.test(text[next] ?? "") &&
      /^\s*[—–]\s*\p{Ll}/u.test(text.slice(next, next + 16));

    const isBoundary =
      !isDecimal &&
      !isInitial &&
      !isStandardAbbreviation &&
      !isVariableAbbreviation &&
      !isDialogueTag &&
      (next >= text.length || nextIsUpperOrNumber || nextIsLower === false);

    if (!isBoundary) {
      cursor = punctuationEnd - 1;
      continue;
    }

    pushSentence(sentenceStart, endWithClosing);
    sentenceStart = next;
    cursor = next - 1;
  }

  pushSentence(sentenceStart, text.length);
  return sentences;
}

interface TextRun {
  text: string;
  startOffset: number;
}

export function getTiptapNodeSize(node: TiptapNode): number {
  if (node.type === "text") return node.text?.length ?? 0;
  const contentSize = (node.content ?? []).reduce(
    (total, child) => total + getTiptapNodeSize(child),
    0,
  );
  if (node.type === "doc") return contentSize;
  if (node.content !== undefined || CONTAINER_NODE_TYPES.has(node.type)) return contentSize + 2;
  return 1;
}

function appendRun(runs: TextRun[], text: string, startOffset: number): void {
  if (!text) return;
  const last = runs.at(-1);
  if (last && last.startOffset + last.text.length === startOffset) {
    last.text += text;
  } else {
    runs.push({ text, startOffset });
  }
}

function collectInlineRuns(node: TiptapNode, position: number, runs: TextRun[]): void {
  if (node.type === "text") {
    appendRun(runs, node.text ?? "", position);
    return;
  }

  if (node.type === "hardBreak" || node.type === "hard_break") {
    appendRun(runs, "\n", position);
    return;
  }

  // Estos nodos no exponen texto como posiciones editables de ProseMirror.
  if (node.type === "footnote" || node.type === "image" || node.type === "horizontalRule") return;

  let childPosition = position + 1;
  for (const child of node.content ?? []) {
    collectInlineRuns(child, childPosition, runs);
    childPosition += getTiptapNodeSize(child);
  }
}

/**
 * Extrae bloques editables directamente del JSON Tiptap. Las posiciones incluyen
 * la estructura de nodos de ProseMirror y usan unidades UTF-16 como el editor.
 * Las notas al pie y átomos sin texto editable se omiten como anclas.
 */
export function extractTiptapTextBlocks(document: TiptapDocument): TiptapTextBlock[] {
  const blocks: TiptapTextBlock[] = [];
  let paragraphIndex = 0;

  const visit = (node: TiptapNode, position: number): void => {
    if (TEXT_BLOCK_TYPES.has(node.type)) {
      const runs: TextRun[] = [];
      let childPosition = position + 1;
      for (const child of node.content ?? []) {
        collectInlineRuns(child, childPosition, runs);
        childPosition += getTiptapNodeSize(child);
      }

      const headingLevel =
        node.type === "heading" && typeof node.attrs?.level === "number"
          ? node.attrs.level
          : undefined;
      const actualRuns = runs.length > 0 ? runs : [{ text: "", startOffset: position + 1 }];
      for (const run of actualRuns) {
        blocks.push({
          type: node.type as TiptapTextBlockType,
          ...(headingLevel === undefined ? {} : { headingLevel }),
          paragraphIndex,
          text: run.text,
          startOffset: run.startOffset,
          endOffset: run.startOffset + run.text.length,
          isDialogue: /^\s*[—–]\s*\S/u.test(run.text),
        });
      }
      paragraphIndex += 1;
      return;
    }

    let childPosition = node.type === "doc" ? position : position + 1;
    for (const child of node.content ?? []) {
      visit(child, childPosition);
      childPosition += getTiptapNodeSize(child);
    }
  };

  visit(document, 0);
  return blocks;
}
