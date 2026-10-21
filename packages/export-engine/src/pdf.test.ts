import { describe, expect, it } from "vitest";
import { buildPdf, toWinAnsi, type PdfDocument, type PdfResult } from "./pdf";
import { pdfContent } from "./test-utils";

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

/** Bytes del PDF, tanto si el resultado viene envuelto como si no. */
function bytes(resultado: PdfResult | Uint8Array): Uint8Array {
  return resultado instanceof Uint8Array ? resultado : resultado.bytes;
}

function asText(resultado: PdfResult | Uint8Array): string {
  const contenido = bytes(resultado);

  let result = "";

  for (const byte of contenido) {
    result += String.fromCharCode(byte);
  }

  return result;
}

/**
 * Devuelve el PDF con los flujos comprimidos desplegados.
 *
 * Los flujos van con `FlateDecode`. Las pruebas comprueban el contenido real
 * del archivo, no sus bytes comprimidos, así que primero los despliegan.
 */
function contenido(resultado: PdfResult | Uint8Array): string {
  return pdfContent(bytes(resultado));
}

/** Compara dos arreglos de bytes sin depender de los tipos de Node. */
function equals(left: PdfResult | Uint8Array, right: PdfResult | Uint8Array): boolean {
  const a = bytes(left);
  const b = bytes(right);

  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
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
    const text = contenido(buildPdf(DOCUMENT));

    expect(text).toContain("(El velo de la tarde)");
    expect(text).toContain("(Caía la tarde sobre la plaza.)");
    expect(text).toContain("(Segunda página)");
  });

  it("escapa los paréntesis y las barras invertidas del texto", () => {
    const text = contenido(
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

    expect(text).toContain(
      "/Title <FEFF0045006C002000760065006C006F0020006400650020006C0061002000740061007200640065>",
    );
    expect(text).toContain("/Author <FEFF0041006E006100200054006F0072007200650073>");
    expect(text).toContain(
      "/Subject <FEFF005000720069006D00650072006100200065006400690063006900F3006E>",
    );
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
    const text = contenido(buildPdf(DOCUMENT));

    // 18 mm desde el borde izquierdo son 51,024 puntos; 210 mm de alto menos
    // 60 mm de línea base son 150 mm: 425,197 puntos.
    expect(text).toContain("1 0 0 1 51.024 425.197 Tm");
  });
});

describe("toWinAnsi", () => {
  it("conserva los signos tipográficos del español", () => {
    const resultado = toWinAnsi("«Cita» — con rayas… y comillas “así”");

    expect(resultado.perdidos).toBe(0);

    // Los signos tipográficos se guardan como sus equivalentes de Win1252,
    // que es la codificación que declara el PDF.
    const puntos = [...resultado.text].map((caracter) => caracter.codePointAt(0) ?? 0);

    expect(puntos).toContain(0x93); // comillas dobles izquierdas
    expect(puntos).toContain(0x94); // comillas dobles derechas
    expect(puntos).toContain(0x97); // raya larga
    expect(puntos).toContain(0x85); // puntos suspensivos
    expect(puntos).toContain(0xab); // comillas angulares de apertura
    expect(puntos).toContain(0xbb); // comillas angulares de cierre
  });

  it("conserva los signos de apertura y cierre en español", () => {
    const resultado = toWinAnsi("«Hola»");

    expect(resultado.perdidos).toBe(0);
    expect(resultado.text).toContain("«");
    expect(resultado.text).toContain("»");
  });

  it("informa de los caracteres que no puede representar", () => {
    const resultado = toWinAnsi("texto 漢 Nip 中文");

    expect(resultado.perdidos).toBeGreaterThan(0);
    expect(resultado.caracteresPerdidos).toContain("漢");
  });

  it("no pierde caracteres en el PDF con acentos y eñes", () => {
    const resultado = buildPdf({
      ...DOCUMENT,
      pages: [
        {
          widthMm: 148,
          heightMm: 210,
          runs: [
            {
              text: "El velo de la tarde caía sobre la plaza; el niño la miró.",
              font: "regular",
              sizePt: 11,
              xMm: 18,
              baselineMm: 30,
            },
          ],
        },
      ],
    });

    expect(resultado.caracteresPerdidos).toEqual([]);
    expect(contenido(resultado)).toContain("caía");
    expect(contenido(resultado)).toContain("niño");
    expect(contenido(resultado)).toContain("miró");
  });
});

describe("formato en línea en el PDF", () => {
  const CON_FORMATO: PdfDocument = {
    title: "El velo de la tarde",
    author: "Ana Torres",
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    language: "es",
    pages: [
      {
        widthMm: 148,
        heightMm: 210,
        runs: [
          { text: "noche", font: "bold", sizePt: 11, xMm: 18, baselineMm: 40, widthMm: 12 },
          { text: "oscura", font: "italic", sizePt: 11, xMm: 30, baselineMm: 40 },
          {
            text: "reloj",
            font: "boldItalic",
            sizePt: 11,
            xMm: 42,
            baselineMm: 40,
            widthMm: 10,
            underline: true,
            strike: true,
          },
          { text: "dos", font: "regular", sizePt: 11, xMm: 52, baselineMm: 40, risePt: 4.18 },
        ],
      },
    ],
  };

  const text = contenido(buildPdf(CON_FORMATO));

  it("declara la negrita cursiva además de las tres fuentes anteriores", () => {
    expect(text).toContain("/BaseFont /Times-Bold");
    expect(text).toContain("/BaseFont /Times-Italic");
    expect(text).toContain("/BaseFont /Times-BoldItalic");
  });

  it("dibuja el subrayado y el tachado como trazos", () => {
    expect(text).toContain(" l S");
  });

  it("desplaza la línea base de los superíndices", () => {
    expect(text).toContain("4.180 Ts");
  });
});
