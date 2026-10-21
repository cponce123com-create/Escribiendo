import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPdf,
  parseTrueTypeFont,
  type PdfDocument,
  type PdfFontProgram,
  type PdfResult,
} from "./index";
import { encodeTrueTypeText, measureTrueTypeTextPoints } from "./truetype";

const FONT_URL = new URL(
  "../../../apps/web/public/fonts/liberation/LiberationSerif-Regular.ttf",
  import.meta.url,
);
const FONT_DATA = new Uint8Array(readFileSync(FONT_URL));
const SANS_BOLD_DATA = new Uint8Array(
  readFileSync(
    new URL("../../../apps/web/public/fonts/liberation/LiberationSans-Bold.ttf", import.meta.url),
  ),
);
const SERIF_BOLD_DATA = new Uint8Array(
  readFileSync(
    new URL("../../../apps/web/public/fonts/liberation/LiberationSerif-Bold.ttf", import.meta.url),
  ),
);

const PROGRAM: PdfFontProgram = {
  family: "serif",
  style: "regular",
  data: FONT_DATA,
  name: "LiberationSerif-Regular",
};

const DOCUMENT: PdfDocument = {
  title: "El velo de la tarde",
  author: "Ana Torres",
  createdAt: new Date("2026-10-20T10:00:00.000Z"),
  language: "es",
  fonts: [PROGRAM],
  pages: [
    {
      widthMm: 148,
      heightMm: 210,
      runs: [
        {
          text: "Caña — “cita” €",
          font: "regular",
          family: "serif",
          sizePt: 11,
          xMm: 18,
          baselineMm: 40,
        },
      ],
    },
  ],
};

function asText(resultado: PdfResult): string {
  let text = "";

  for (const byte of resultado.bytes) {
    text += String.fromCharCode(byte);
  }

  return text;
}

describe("fuentes TrueType en el PDF", () => {
  it("lee la tabla de nombres y los anchos reales", () => {
    const font = parseTrueTypeFont(FONT_DATA);

    expect(font.postScriptName).toMatch(/^LiberationSerif/u);
    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.numGlyphs).toBeGreaterThan(0);
    expect(measureTrueTypeTextPoints(font, "H", 10)).toBeGreaterThan(0);
  });

  it("codifica los signos del español sin pérdidas", () => {
    const font = parseTrueTypeFont(FONT_DATA);
    const encoded = encodeTrueTypeText(font, "Caña — “cita” €");

    expect(encoded.perdidos).toEqual([]);
    expect(encoded.cids.length).toBe("Caña — “cita” €".length);
  });

  it("informa de un carácter que la fuente no tiene", () => {
    const font = parseTrueTypeFont(FONT_DATA);
    const encoded = encodeTrueTypeText(font, "texto \u{20000}");

    expect(encoded.perdidos.length).toBeGreaterThan(0);
    expect(encoded.sustituido).toBe(true);
  });

  it("incrusta Type0, FontFile2 y ToUnicode y usa códigos hexadecimales", () => {
    const resultado = buildPdf(DOCUMENT);
    const text = asText(resultado);

    expect(resultado.fuentesIncrustadas).toBe(1);
    expect(resultado.caracteresPerdidos).toEqual([]);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/Subtype /CIDFontType2");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("/ToUnicode");
    expect(text).toContain("/CIDToGIDMap /Identity");
    expect(text).toContain("/Encoding /Identity-H");
    expect(text).toContain("<");
    expect(text).not.toContain("(Caña");
  });

  it("incrusta solo las caras que usa el documento", () => {
    const resultado = buildPdf({
      ...DOCUMENT,
      fonts: [
        PROGRAM,
        {
          family: "serif",
          style: "bold",
          data: SERIF_BOLD_DATA,
          name: "LiberationSerif-Bold",
        },
        {
          family: "sans-serif",
          style: "bold",
          data: SANS_BOLD_DATA,
          name: "LiberationSans-Bold",
        },
      ],
      pages: [
        {
          widthMm: 148,
          heightMm: 210,
          runs: [
            {
              text: "Redonda",
              font: "regular",
              family: "serif",
              sizePt: 11,
              xMm: 18,
              baselineMm: 40,
            },
            {
              text: "Negrita",
              font: "bold",
              family: "sans-serif",
              sizePt: 11,
              xMm: 18,
              baselineMm: 50,
            },
          ],
        },
      ],
    });
    const text = asText(resultado);

    expect(resultado.fuentesIncrustadas).toBe(2);
    expect(text).toContain("/BaseFont /LiberationSerif ");
    expect(text).toContain("/BaseFont /LiberationSans-Bold");
    expect(text).not.toContain("/BaseFont /LiberationSerif-Bold");
    expect(text).toContain("/E1 ");
    expect(text).toContain("/E2 ");
  });

  it("es determinista con la misma fuente", () => {
    const primero = buildPdf(DOCUMENT);
    const segundo = buildPdf(DOCUMENT);

    expect(primero.bytes).toEqual(segundo.bytes);
  });
});
