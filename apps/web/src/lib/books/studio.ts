import type { SectionNode } from "./section-tree";

export const SECTION_GROUPS = ["Preliminares", "Cuerpo de la obra", "Páginas finales"] as const;
export type SectionGroup = (typeof SECTION_GROUPS)[number];
const FRONT = new Set([
  "HALF_TITLE",
  "TITLE_PAGE",
  "COPYRIGHT",
  "DEDICATION",
  "EPIGRAPH",
  "TABLE_OF_CONTENTS",
  "FOREWORD",
  "PROLOGUE",
  "INTRODUCTION",
]);
const BACK = new Set([
  "ACKNOWLEDGMENTS",
  "AUTHOR_NOTES",
  "ABOUT_AUTHOR",
  "BIBLIOGRAPHY",
  "GLOSSARY",
  "APPENDIX",
  "OTHER_BOOKS",
]);

export function sectionGroup(type: string): SectionGroup {
  return FRONT.has(type)
    ? "Preliminares"
    : BACK.has(type)
      ? "Páginas finales"
      : "Cuerpo de la obra";
}

/** Agrupa únicamente raíces; los hijos conservan su padre y su orden editorial. */
export function groupSections(nodes: SectionNode[]) {
  return SECTION_GROUPS.map((label) => ({
    label,
    nodes: nodes.filter((node) => sectionGroup(node.type) === label),
  }));
}

export function readingMinutes(words: number): number {
  return Math.ceil(Math.max(0, words) / 220);
}

/** Coincidencias literales, incluidas las que atraviesan marcas de formato. */
export function textMatches(text: string, query: string): Array<{ from: number; to: number }> {
  if (!query.trim()) return [];
  const haystack = text.toLocaleLowerCase("es");
  const needle = query.toLocaleLowerCase("es");
  const result: Array<{ from: number; to: number }> = [];
  let start = 0;
  while (start <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, start);
    if (found < 0) break;
    result.push({ from: found, to: found + needle.length });
    start = found + needle.length;
  }
  return result;
}
