import { describe, expect, it } from "vitest";
import { buildPdf, type PdfDocument } from "./pdf";

const DOCUMENT: PdfDocument = {
  title: "El velo de la tarde",
  author: "Ana Torres",
  subject: "Primera edición",
  createdAt: new Date("2026-10-20T10:00:00.000Z"),
  language: "es",
  pages: [
    {
      widthMm: 148,
      heightMm: 210,
      runs: [
        { text: "El velo de la tarde", font: "bold", sizePt: 20, xMm: 18, baselineMm: 40 },
        {
          text: "Caía la tarde sobre la plaza.",
          font: "regular",
          sizePt: 11,
          xMm: 18,
          baselineMm: 60,
        },
      ],
    },
    {
      widthMm: 148,
      heightMm: 210,
      runs: [{ text: "Segunda página", font: "regular", sizePt: 11, xMm: 18, baselineMm: 30 }],
    },
  ],
};

function asText(bytes: Uint8Array): string {
  let result = "";

  for (const byte of bytes) {
    result += String.fromCharCode(byte);
  }

  return result;
}

/** Compara dos arreglos de bytes sin depender de los tipos de Node. */
function equals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

describe("buildPdf", () => {
  it("produce un archivo que empieza por la cabecera PDF", () => {
    const bytes = buildPdf(DOCUMENT);
    const text = asText(bytes);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("declara el número de páginas del documento", () => {
    const text = asText(buildPdf(DOCUMENT));

    expect(text).toContain("/Type /Pages /Count 2");
    expect(text).toContain("/Type /Catalog");
  });

  it("incluye las fuentes estándar sin incrustar", () => {
    const text = asText(buildPdf(DOCUMENT));

    expect(text).toContain("/BaseFont /Times-Roman");
    expect(text).toContain("/BaseFont /Times-Bold");
    expect(text).toContain("/BaseFont /Times-Italic");
  });

  it("escribe el texto de cada página", () => {
    const text = asText(buildPdf(DOCUMENT));

    expect(text).toContain("(El velo de la tarde)");
    expect(text).toContain("(Caía la tarde sobre la plaza.)");
    expect(text).toContain("(Segunda página)");
  });

  it("escapa los paréntesis y las barras invertidas del texto", () => {
    const text = asText(
      buildPdf({
        ...DOCUMENT,
        pages: [
          {
            widthMm: 148,
            heightMm: 210,
            runs: [
              {
                text: "una (idea) con \\ barra",
                font: "regular",
                sizePt: 11,
                xMm: 10,
                baselineMm: 20,
              },
            ],
          },
        ],
      }),
    );

    expect(text).toContain("(una \\(idea\\) con \\\\ barra)");
  });

  it("conserva los metadatos del documento", () => {
    const text = asText(buildPdf(DOCUMENT));

    expect(text).toContain("(El velo de la tarde)");
    expect(text).toContain("(Ana Torres)");
    expect(text).toContain("(Primera edición)");
    expect(text).toContain("/CreationDate (D:20261020100000Z)");
  });

  it("usa la caja de la hoja acabada como CropBox y TrimBox", () => {
    const text = asText(buildPdf(DOCUMENT));

    // 148 mm son 419,528 puntos y 210 mm son 595,276.
    expect(text).toContain("/CropBox [0.000 0.000 419.528 595.276]");
    expect(text).toContain("/TrimBox [0.000 0.000 419.528 595.276]");
  });

  it("añade el sangrado a la hoja física y marca la caja de sangre", () => {
    const text = asText(
      buildPdf({
        ...DOCUMENT,
        pages: [
          {
            widthMm: 148,
            heightMm: 210,
            bleedMm: 3,
            cropMarks: true,
            runs: [],
          },
        ],
      }),
    );

    // Con 3 mm de sangrado y marcas, la hoja física crece.
    expect(text).toContain("/MediaBox [0.000 0.000");
    expect(text).toContain("/BleedBox [");
    expect(text).not.toContain("/BleedBox [0.000 0.000 419.528 595.276]");
  });

  it("no incluye marcas de corte cuando no se piden", () => {
    const text = asText(buildPdf(DOCUMENT));

    expect(text).not.toContain("/BleedBox");
  });

  it("genera el mismo archivo para el mismo documento", () => {
    const primero = buildPdf(DOCUMENT);
    const segundo = buildPdf(DOCUMENT);

    expect(equals(primero, segundo)).toBe(true);
  });

  it("posiciona el texto en la línea base indicada", () => {
    const text = asText(buildPdf(DOCUMENT));

    // 18 mm desde el borde izquierdo son 51,024 puntos; 210 mm de alto menos
    // 60 mm de línea base son 150 mm: 425,197 puntos.
    expect(text).toContain("1 0 0 1 51.024 425.197 Tm");
  });
});
