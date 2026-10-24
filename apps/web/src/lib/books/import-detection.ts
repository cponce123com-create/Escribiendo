import type { TiptapDocument, TiptapNode } from "@escribiendo/book-schema";
import type { ImportSectionType } from "./import-types";
export interface ImportTextBlock {
  text: string;
  heading?: boolean;
  boundary?: boolean;
  headingLevel?: number;
  node?: TiptapNode;
  sectionType?: ImportSectionType;
}
export interface DetectedImportSection {
  title: string;
  paragraphs: string[];
  type: ImportSectionType;
  content: TiptapDocument;
}
const NUMBER =
  "(?:[0-9]+|[IVXLCDM]+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|primero|segundo|tercero|primera|segunda|tercera)";
const NUMBERED = new RegExp(
  `^(?:cap[ií]tulo|chapter|chapitre|capitolo|parte|part|libro)\\s+${NUMBER}(?:[.:)\\s—–-]+.{0,130})?$`,
  "iu",
);
const SPECIAL =
  /^(?:pr[oó]logo|ep[ií]logo|introducci[oó]n|prefacio|foreword|dedicatoria|agradecimientos|reconocimientos|[ií]ndice|contenido|tabla de contenidos|copyright|derechos de autor|p[aá]gina legal|bibliograf[ií]a|ep[ií]grafe|acerca del autor|sobre el autor)(?:\s*[:—–-]\s*.{1,100})?$/iu;
export function inferImportSectionType(title: string): ImportSectionType {
  const t = title.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  const patterns: Array<[RegExp, ImportSectionType]> = [
    [/^(parte|part|libro)\b/u, "PART"],
    [/^prologo\b/u, "PROLOGUE"],
    [/^epilogo\b/u, "EPILOGUE"],
    [/^introduccion\b/u, "INTRODUCTION"],
    [/^(prefacio|foreword)\b/u, "FOREWORD"],
    [/^dedicatoria\b/u, "DEDICATION"],
    [/^epigrafe\b/u, "EPIGRAPH"],
    [/^(agradecimientos|reconocimientos)\b/u, "ACKNOWLEDGMENTS"],
    [/^(indice|contenido|tabla de contenidos)$/u, "TABLE_OF_CONTENTS"],
    [/^(copyright|derechos de autor|pagina legal)\b/u, "COPYRIGHT"],
    [/^bibliografia\b/u, "BIBLIOGRAPHY"],
    [/^(acerca del autor|sobre el autor)\b/u, "ABOUT_AUTHOR"],
  ];
  return patterns.find(([pattern]) => pattern.test(t))?.[1] ?? "CHAPTER";
}
export function isImportHeading(text: string): boolean {
  const value = text.trim();
  return (
    value.length <= 180 &&
    value.split(/\s+/u).length <= 24 &&
    !/\.{3,}|…\s*\d+\s*$/u.test(value) &&
    (NUMBERED.test(value) || SPECIAL.test(value))
  );
}
export function detectImportSections(
  blocks: readonly ImportTextBlock[],
  defaultTitle: string,
): DetectedImportSection[] {
  const levels = blocks.flatMap((block) =>
    block.headingLevel && block.headingLevel > 0 ? [block.headingLevel] : block.heading ? [1] : [],
  );
  const top = levels.length ? Math.min(...levels) : 1;
  const boundary = (block: ImportTextBlock) =>
    Boolean(
      block.boundary ||
      block.sectionType ||
      (block.headingLevel ?? (block.heading ? 1 : 99)) === top ||
      isImportHeading(block.text),
    );
  const result: DetectedImportSection[] = [];
  let title = defaultTitle,
    type: ImportSectionType = blocks.some(boundary) ? "CUSTOM" : "CHAPTER",
    explicit = false;
  let content: TiptapNode[] = [],
    paragraphs: string[] = [];
  function flush() {
    if (content.length || explicit)
      result.push({
        title: title.slice(0, 300),
        type,
        paragraphs,
        content: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] },
      });
    content = [];
    paragraphs = [];
  }
  for (const block of blocks) {
    const text = block.text.replace(/\r\n?/gu, "\n").trim();
    if (!text) continue;
    if (boundary(block)) {
      if (explicit && !content.length && text === title) continue;
      // Un rótulo numerado seguido de su título compone una sola cabecera.
      if (
        explicit &&
        !content.length &&
        NUMBERED.test(title) &&
        !isImportHeading(text) &&
        !block.sectionType
      ) {
        title = `${title} — ${text}`;
        continue;
      }
      flush();
      title = text;
      type = block.sectionType ?? inferImportSectionType(text);
      explicit = true;
      continue;
    }
    paragraphs.push(text);
    content.push(
      block.node ?? {
        type: block.headingLevel ? "heading" : "paragraph",
        ...(block.headingLevel ? { attrs: { level: Math.min(3, block.headingLevel) } } : {}),
        content: [{ type: "text", text }],
      },
    );
  }
  flush();
  return result;
}
