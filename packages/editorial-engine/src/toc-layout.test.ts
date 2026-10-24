import { describe, expect, it } from "vitest";
import { paginate, type LayoutBlock, type PageGeometry } from "./pagination";
import type { TypographyConfig } from "./typography";

/**
 * Geometría de laboratorio para el índice: 120 × 120 mm con márgenes de 10 mm,
 * de modo que el área de texto mide 100 mm de ancho.
 */
const GEOMETRY: PageGeometry = {
  pageWidthMm: 120,
  pageHeightMm: 120,
  marginTopMm: 10,
  marginBottomMm: 10,
  marginInnerMm: 10,
  marginOuterMm: 10,
};

const ESTILO: TypographyConfig["body"] = {
  fontFamily: "serif",
  fontSizePt: 11,
  lineHeight: 1.3,
  spaceBeforePt: 0,
  spaceAfterPt: 0,
  alignment: "left",
  firstLineIndentMm: 0,
  letterSpacingPt: 0,
  uppercase: false,
  smallCaps: false,
  hyphenation: false,
  keepWithNext: false,
};

const TIPOGRAFIA: TypographyConfig = {
  body: ESTILO,
  heading1: { ...ESTILO, keepWithNext: true },
  heading2: ESTILO,
  heading3: ESTILO,
  heading4: ESTILO,
  blockquote: ESTILO,
  code: ESTILO,
  list: ESTILO,
  firstParagraph: ESTILO,
  widowOrphan: { minLinesAtBottom: 2, minLinesAtTop: 2 },
  firstParagraphNoIndent: true,
  bodyFirstLineIndentMm: 0,
};

/**
 * Fixture de referencia: títulos largos, anidación y folios de 1, 2, 3 y 4
 * dígitos. Es la base de las pruebas de alineación del índice.
 */
export const TOC_FIXTURE = [
  { title: "Uno", label: "7" },
  { title: "Un capítulo con un título deliberadamente largo que no cabe en una línea", label: "42" },
  { title: "  Subapartado anidado", label: "137" },
  { title: "1.024", label: "1.024" },
] as const;

function tocBlocks(): LayoutBlock[] {
  return TOC_FIXTURE.map((entry, index) => ({
    id: `toc-${index}`,
    kind: "body",
    text: `${entry.title} ${entry.label}`,
    tocEntry: { title: entry.title, label: entry.label, leaders: true },
  }));
}

describe("composición del índice (caracterización previa a ECP-01)", () => {
  const result = paginate(tocBlocks(), GEOMETRY, TIPOGRAFIA);
  const block = result.pages[0]?.blocks[0];

  it("compone el folio concatenado al título tras los puntos", () => {
    expect(block).toBeDefined();
    const lastLine = block!.lines.at(-1);

    expect(lastLine?.text).toContain(".");
    expect(lastLine?.text.trimEnd().endsWith("7")).toBe(true);
  });

  it("no expone todavía una caja de folio independiente", () => {
    const line = block!.lines[0];

    expect("toc" in line).toBe(false);
  });

  it("parte los títulos largos y deja el folio solo en la última línea", () => {
    const longEntry = result.pages[0]?.blocks[1];

    expect(longEntry).toBeDefined();
    expect(longEntry!.lines.length).toBeGreaterThan(1);
    expect(longEntry!.lines.slice(0, -1).every((line) => !line.text.includes("42"))).toBe(true);
  });
});
