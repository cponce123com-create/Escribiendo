import { isImportHeading, type ImportTextBlock } from "./import-detection";
export interface PdfImportItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
  height?: number;
}
export interface PdfImportPage {
  height: number;
  items: PdfImportItem[];
}
interface Line {
  text: string;
  x: number;
  y: number;
  height: number;
  page: number;
  pageHeight: number;
}
function pageLines(page: PdfImportPage, index: number): Line[] {
  const lines: Line[] = [];
  let current: Line | undefined;
  let right = 0;
  for (const item of page.items) {
    if (!item.str) continue;
    const x = item.transform?.[4] ?? right,
      y = item.transform?.[5] ?? current?.y ?? 0;
    const height = Math.abs(item.height ?? item.transform?.[3] ?? 11) || 11;
    if (!current || Math.abs(y - current.y) > Math.max(2, height * 0.35)) {
      current = { text: item.str, x, y, height, page: index, pageHeight: page.height };
      lines.push(current);
    } else {
      const gap = x - right;
      const separator =
        gap > Math.max(1, height * 0.12) && !current.text.endsWith(" ") && !item.str.startsWith(" ")
          ? " "
          : "";
      current.text += separator + item.str;
      current.height = Math.max(current.height, height);
    }
    right = x + (item.width ?? item.str.length * height * 0.45);
    if (item.hasEOL) current = undefined;
  }
  // El orden de los objetos PDF no garantiza el orden visual.
  return lines.sort((a, b) => b.y - a.y || a.x - b.x);
}
export function pdfImportBlocks(pages: readonly PdfImportPage[]): {
  blocks: ImportTextBlock[];
  removed: number;
} {
  const all = pages.map(pageLines);
  const repeated = new Map<string, Set<number>>();
  const margin = (line: Line) => line.y > line.pageHeight * 0.91 || line.y < line.pageHeight * 0.08;
  for (const lines of all)
    for (const line of lines)
      if (margin(line) && line.text.trim().length < 120) {
        const key = line.text.trim().replace(/\d+/gu, "#");
        const seen = repeated.get(key) ?? new Set();
        seen.add(line.page);
        repeated.set(key, seen);
      }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  let removed = 0;
  const blocks: ImportTextBlock[] = [];
  const seenChapterHeaders = new Set<string>();
  let text = "",
    previous: Line | undefined;
  const flush = () => {
    if (text.trim()) blocks.push({ text: text.trim() });
    text = "";
  };
  for (const lines of all) {
    const heights = lines.map((line) => line.height).sort((a, b) => a - b);
    const median = heights[Math.floor(heights.length / 2)] ?? 11;
    for (const line of lines) {
      const value = line.text.trim();
      if (!value) continue;
      const key = value.replace(/\d+/gu, "#");
      const repeatedMargin = margin(line) && (repeated.get(key)?.size ?? 0) >= threshold;
      const pureFolio =
        margin(line) && pages.length >= 2 && /^(?:[0-9]+|[ivxlcdm]+)$/iu.test(value);
      if (repeatedMargin || pureFolio) {
        const firstChapterHeader = isImportHeading(value) && !seenChapterHeaders.has(value);
        if (firstChapterHeader) seenChapterHeaders.add(value);
        else {
          removed++;
          continue;
        }
      }
      if (isImportHeading(value) || (value.length < 120 && line.height > median * 1.3)) {
        flush();
        blocks.push({ text: value, ...(line.height > median * 1.3 ? { headingLevel: 1 } : {}) });
        previous = undefined;
        continue;
      }
      const samePage = previous?.page === line.page;
      const gap = samePage ? Math.abs(previous!.y - line.y) : 0;
      const indented = previous && line.x > previous.x + Math.max(8, median * 0.8);
      const paragraphBreak = samePage && (gap > median * 1.8 || indented);
      if (paragraphBreak) flush();
      // Las continuaciones de renglón y de página se reúnen sin inventar palabras.
      text = text.endsWith("\u00ad")
        ? text.slice(0, -1) + value
        : text
          ? `${text} ${value}`
          : value;
      previous = line;
    }
  }
  flush();
  return { blocks, removed };
}
