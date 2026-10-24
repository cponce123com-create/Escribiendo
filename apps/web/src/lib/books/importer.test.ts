import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPdf, buildZip, type PdfDocument } from "@escribiendo/export-engine";

vi.mock("server-only", () => ({}));

import { BookImportError, MAX_IMPORT_FILE_BYTES, parseBookImport } from "./importer";

const epubFixture = () =>
  buildZip(
    [
      { name: "mimetype", data: new TextEncoder().encode("application/epub+zip"), first: true },
      {
        name: "META-INF/container.xml",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
        ),
      },
      {
        name: "OEBPS/book.opf",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><package><metadata><dc:title>El libro EPUB</dc:title><dc:creator>Eva Autora</dc:creator><dc:language>es</dc:language></metadata><manifest><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter1"/></spine></package>',
        ),
      },
      {
        name: "OEBPS/chapter1.xhtml",
        data: new TextEncoder().encode(
          "<html><body><h1>Capítulo 1. El comienzo</h1><p>Primera página.</p><p>Una nueva aventura.</p></body></html>",
        ),
      },
    ],
    new Date("2026-01-01T00:00:00.000Z"),
  );

const docxFixture = () =>
  buildZip(
    [
      {
        name: "word/document.xml",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo 1</w:t></w:r></w:p><w:p><w:r><w:t>Texto del primer capítulo.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo 2</w:t></w:r></w:p><w:p><w:r><w:t>Texto del segundo capítulo.</w:t></w:r></w:p></w:body></w:document>',
        ),
      },
      {
        name: "word/styles.xml",
        data: new TextEncoder().encode(
          '<w:styles xmlns:w="urn:w"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>',
        ),
      },
      {
        name: "docProps/core.xml",
        data: new TextEncoder().encode(
          '<cp:coreProperties xmlns:dc="urn:dc"><dc:title>El libro DOCX</dc:title><dc:creator>Leo Autor</dc:creator></cp:coreProperties>',
        ),
      },
    ],
    new Date("2026-01-01T00:00:00.000Z"),
  );

const pdfFixture = () => {
  const document: PdfDocument = {
    title: "El libro PDF",
    author: "Mara Autora",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    language: "es",
    pages: [
      {
        widthMm: 148,
        heightMm: 210,
        runs: [
          { text: "Capítulo 1", font: "bold", sizePt: 14, xMm: 18, baselineMm: 40 },
          {
            text: "Texto del PDF seleccionable.",
            font: "regular",
            sizePt: 11,
            xMm: 18,
            baselineMm: 60,
          },
        ],
      },
    ],
  };
  const result = buildPdf(document);
  return result instanceof Uint8Array ? result : result.bytes;
};

describe("parseBookImport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lee título, autoría, idioma y capítulo de un EPUB respetando el orden de lectura", async () => {
    const parsed = await parseBookImport("muestra.epub", epubFixture());

    expect(parsed).toMatchObject({
      format: "epub",
      title: "El libro EPUB",
      authorName: "Eva Autora",
      language: "es",
      sections: [
        {
          title: "Capítulo 1. El comienzo",
          paragraphs: ["Primera página.", "Una nueva aventura."],
        },
      ],
    });
  });

  it("usa estilos Heading 1 y metadatos centrales al leer un DOCX", async () => {
    const parsed = await parseBookImport("muestra.docx", docxFixture());

    expect(parsed).toMatchObject({
      format: "docx",
      title: "El libro DOCX",
      authorName: "Leo Autor",
      sections: [
        { title: "Capítulo 1", paragraphs: ["Texto del primer capítulo."] },
        { title: "Capítulo 2", paragraphs: ["Texto del segundo capítulo."] },
      ],
    });
  });

  it("extrae texto seleccionable y metadatos de un PDF", async () => {
    const parsed = await parseBookImport("muestra.pdf", pdfFixture());

    expect(parsed.format).toBe("pdf");
    expect(parsed.title).toBe("El libro PDF");
    expect(parsed.authorName).toBe("Mara Autora");
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.paragraphs.join(" ")).toContain("Texto del PDF seleccionable.");
  });

  it("rechaza extensiones no permitidas y archivos mayores de 15 MB", async () => {
    await expect(parseBookImport("libro.txt", new Uint8Array([1]))).rejects.toBeInstanceOf(
      BookImportError,
    );
    await expect(
      parseBookImport("libro.pdf", new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)),
    ).rejects.toThrow("15 MB");
  });

  it("rechaza PDFs escaneados que no contienen texto seleccionable con un mensaje útil", async () => {
    const document: PdfDocument = {
      title: "Sin texto",
      author: "",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      pages: [{ widthMm: 148, heightMm: 210, runs: [] }],
    };

    const result = buildPdf(document);
    const bytes = result instanceof Uint8Array ? result : result.bytes;
    await expect(parseBookImport("escaneado.pdf", bytes)).rejects.toThrow("OCR");
  });
});
