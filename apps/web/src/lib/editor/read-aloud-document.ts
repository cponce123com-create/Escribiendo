import type { TiptapDocument, TiptapNode } from "@escribiendo/book-schema";

export type ReadAloudBlockType =
  "paragraph" | "heading" | "quote" | "list-item" | "scene-break" | "image";

export interface ReadAloudTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
}

export interface ReadAloudBlock {
  type: ReadAloudBlockType;
  text: string;
  runs: ReadAloudTextRun[];
  imageUrl?: string;
}

function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_000 || value.startsWith("//")) return undefined;
  if (value.startsWith("/") && !value.startsWith("/\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function addRun(runs: ReadAloudTextRun[], run: ReadAloudTextRun): void {
  if (!run.text) return;
  const previous = runs.at(-1);
  if (
    previous &&
    previous.bold === run.bold &&
    previous.italic === run.italic &&
    previous.underline === run.underline &&
    previous.strike === run.strike &&
    previous.code === run.code
  ) {
    previous.text += run.text;
  } else {
    runs.push(run);
  }
}

function inlineRuns(nodes: readonly TiptapNode[]): ReadAloudTextRun[] {
  const runs: ReadAloudTextRun[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      addRun(runs, {
        text: node.text ?? "",
        ...(marks.has("bold") ? { bold: true } : {}),
        ...(marks.has("italic") ? { italic: true } : {}),
        ...(marks.has("underline") ? { underline: true } : {}),
        ...(marks.has("strike") ? { strike: true } : {}),
        ...(marks.has("code") ? { code: true } : {}),
      });
    } else if (node.type === "hardBreak") {
      addRun(runs, { text: "\n" });
    } else if (node.type === "footnote") {
      const note = node.attrs?.note;
      if (typeof note === "string") addRun(runs, { text: ` (nota: ${note})` });
    } else if (node.content) {
      for (const run of inlineRuns(node.content)) addRun(runs, run);
    }
  }
  return runs;
}

function trimRuns(runs: ReadAloudTextRun[]): ReadAloudTextRun[] {
  const joined = runs.map((run) => run.text).join("");
  const leftTrim = joined.length - joined.trimStart().length;
  const rightEdge = joined.trimEnd().length;
  let position = 0;
  const trimmed: ReadAloudTextRun[] = [];
  for (const run of runs) {
    const start = Math.max(0, leftTrim - position);
    const end = Math.min(run.text.length, rightEdge - position);
    if (end > start) addRun(trimmed, { ...run, text: run.text.slice(start, end) });
    position += run.text.length;
  }
  return trimmed;
}

function blockFromNode(node: TiptapNode, inherited?: "quote" | "list-item"): ReadAloudBlock[] {
  if (node.type === "sceneBreak" || node.type === "horizontalRule") {
    return [{ type: "scene-break", text: "", runs: [] }];
  }
  if (node.type === "image") {
    const alt = node.attrs?.alt;
    const text = typeof alt === "string" ? alt.trim() : "";
    const imageUrl = safeImageUrl(node.attrs?.src);
    if (!text && !imageUrl) return [];
    return [
      { type: "image", text, runs: text ? [{ text }] : [], ...(imageUrl ? { imageUrl } : {}) },
    ];
  }
  if (node.type === "paragraph" || node.type === "heading") {
    const runs = trimRuns(inlineRuns(node.content ?? []));
    const text = runs.map((run) => run.text).join("");
    if (!text) return [];
    return [{ type: inherited ?? (node.type === "heading" ? "heading" : "paragraph"), text, runs }];
  }
  if (node.type === "blockquote") {
    return (node.content ?? []).flatMap((child) => blockFromNode(child, "quote"));
  }
  if (node.type === "listItem") {
    return (node.content ?? []).flatMap((child) => blockFromNode(child, "list-item"));
  }
  return (node.content ?? []).flatMap((child) => blockFromNode(child, inherited));
}

/** Converts a validated TipTap document to safe, semantic blocks for the book reader. */
export function readAloudBlocksFromDocument(document: TiptapDocument): ReadAloudBlock[] {
  return document.content.flatMap((node) => blockFromNode(node));
}
