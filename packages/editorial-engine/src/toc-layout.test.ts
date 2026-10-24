import { describe, expect, it } from "vitest";
import { measureTextMm } from "./measure";
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

const CONTENT_WIDTH_MM = 100;

/** Tolerancia exigida por la auditoría para el borde derecho de los folios. */
const FOLIO_TOLERANCE_MM = 0.5;

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
const TOC_FIXTURE = [
  { title: "Uno", label: "7" },
  {
    title: "Un capítulo con un título deliberadamente largo que no cabe en una línea",
    label: "42",
  },
  { title: "Subapartado anidado", label: "137" },
  { title: "Epílogo", label: "1.024" },
] as const;

function tocBlocks(): LayoutBlock[] {
  return TOC_FIXTURE.map((entry, index) => ({
    id: `toc-${index}`,
    kind: "body",
    text: entry.title,
    tocEntry: { title: entry.title, label: entry.label, leaders: true },
  }));
}

describe("columna de folio del índice", () => {
  const result = paginate(tocBlocks(), GEOMETRY, TIPOGRAFIA);
  const blocks = result.pages[0]?.blocks ?? [];

  it("ancla el borde derecho de cada folio al margen con tolerancia de 0,5 mm", () => {
    expect(blocks).toHaveLength(TOC_FIXTURE.length);

    for (const [index, block] of blocks.entries()) {
      const line = block.lines.at(-1);
      const folio = line?.toc;
      const expected = TOC_FIXTURE[index]!.label;

      expect(folio, `falta la geometría del folio en «${expected}»`).toBeDefined();
      expect(folio!.text).toBe(expected);
      expect(Math.abs(folio!.xMm + folio!.widthMm - CONTENT_WIDTH_MM)).toBeLessThanOrEqual(
        FOLIO_TOLERANCE_MM,
      );
      // El folio se mide con la misma fuente del bloque: el ancho declarado
      // tiene que coincidir con la medición real del número.
      expect(Math.abs(folio!.widthMm - measureTextMm(expected, { ...ESTILO }))).toBeLessThanOrEqual(
        0.01,
      );
    }
  });

  it("no mezcla el folio en el texto de la línea", () => {
    for (const [index, block] of blocks.entries()) {
      const line = block.lines.at(-1);
      const label = TOC_FIXTURE[index]!.label;

      expect(line?.text).not.toContain(label);
      expect(line?.segments?.map((segment) => segment.text).join("")).toBe(line?.text);
    }
  });

  it("dibuja los líderes entre el título y el folio, sin invadir la columna", () => {
    for (const block of blocks) {
      const line = block.lines.at(-1);
      const folio = line?.toc;

      expect(folio?.leaderStartMm).not.toBeNull();
      expect(folio?.leaderEndMm).not.toBeNull();
      expect(folio!.leaderEndMm!).toBeLessThan(folio!.xMm);
      expect(folio!.leaderStartMm!).toBeLessThan(folio!.leaderEndMm!);
      expect(folio!.dotted).toBe(true);
    }
  });

  it("parte los títulos largos y deja el folio solo en la última línea", () => {
    const longEntry = blocks[1];

    expect(longEntry).toBeDefined();
    expect(longEntry!.lines.length).toBeGreaterThan(1);
    expect(longEntry!.lines.slice(0, -1).every((line) => line.toc === undefined)).toBe(true);
    expect(longEntry!.lines.at(-1)?.toc?.text).toBe("42");
  });
});

describe("índice sin puntos guía", () => {
  it("omite el líder cuando la plantilla no los pide y mantiene el folio anclado", () => {
    const [block] = paginate(
      [
        {
          id: "toc",
          kind: "body",
          text: "Uno",
          tocEntry: { title: "Uno", label: "7", leaders: false },
        },
      ],
      GEOMETRY,
      TIPOGRAFIA,
    ).pages[0]!.blocks;

    const folio = block!.lines.at(-1)?.toc;

    expect(folio?.leaderStartMm).toBeNull();
    expect(folio?.leaderEndMm).toBeNull();
    expect(Math.abs(folio!.xMm + folio!.widthMm - CONTENT_WIDTH_MM)).toBeLessThanOrEqual(
      FOLIO_TOLERANCE_MM,
    );
  });
});
