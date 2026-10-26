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

function docxFromXml(xml: string, styles?: string): Uint8Array {
  return buildZip(
    [
      { name: "word/document.xml", data: new TextEncoder().encode(xml) },
      ...(styles ? [{ name: "word/styles.xml", data: new TextEncoder().encode(styles) }] : []),
    ],
    new Date("2026-01-01T00:00:00Z"),
  );
}
it("DOCX conserva el orden de ejecuciones, tablas e hipervínculos y omite texto eliminado", async () => {
  const xml =
    '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Antes </w:t></w:r><w:hyperlink><w:r><w:t>del enlace</w:t></w:r></w:hyperlink><w:r><w:rPr><w:i/></w:rPr><w:t> después.</w:t></w:r><w:del><w:r><w:delText>BORRADO</w:delText></w:r></w:del><w:r><w:instrText>CAMPO OCULTO</w:instrText></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda primera.</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Celda segunda.</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Al final.</w:t></w:r></w:p></w:body></w:document>';
  const book = await parseBookImport("orden.docx", docxFromXml(xml));
  expect(book.sections[0]?.paragraphs).toEqual([
    "Antes del enlace después.",
    "Celda primera.",
    "Celda segunda.",
    "Al final.",
  ]);
  expect(JSON.stringify(book.sections[0]?.content)).toContain('"italic"');
  expect(JSON.stringify(book)).not.toContain("BORRADO");
  expect(JSON.stringify(book)).not.toContain("CAMPO OCULTO");
});
it("DOCX reconoce estilos heredados y encabezados en español sin separar subapartados", async () => {
  const styles =
    '<w:styles xmlns:w="urn:w"><w:style w:styleId="Base"><w:name w:val="Título 1"/></w:style><w:style w:styleId="MiCapitulo"><w:basedOn w:val="Base"/></w:style><w:style w:styleId="Subtitulo"><w:name w:val="Título 2"/></w:style></w:styles>';
  const p = (style: string, text: string) =>
    `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const xml = `<w:document xmlns:w="urn:w"><w:body>${p("MiCapitulo", "El despertar")}${p("", "Inicio.")}${p("Subtitulo", "La mañana")}${p("", "Más texto.")}${p("MiCapitulo", "El regreso")}${p("", "Final.")}</w:body></w:document>`;
  const book = await parseBookImport("estilos.docx", docxFromXml(xml, styles));
  expect(book.sections.map((section) => section.title)).toEqual(["El despertar", "El regreso"]);
  expect(book.sections[0]?.paragraphs).toContain("La mañana");
});
it("EPUB usa navegación con anclas, h2 y saltos de línea sin fusionar palabras", async () => {
  const parts: Record<string, string> = {
    "META-INF/container.xml":
      '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
    "OEBPS/book.opf":
      '<package><metadata><title>Una novela</title></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav"/><item id="body" href="texto.xhtml"/></manifest><spine><itemref idref="body"/></spine></package>',
    "OEBPS/nav.xhtml":
      '<html><body><nav><a href="texto.xhtml#a">El inicio</a><a href="texto.xhtml#b">El final</a></nav></body></html>',
    "OEBPS/texto.xhtml":
      '<html><body><h2 id="a">El inicio</h2><p>Hola <em>mundo</em><br/>otra línea.</p><h2 id="b">El final</h2><p>Fin.</p></body></html>',
  };
  const zip = buildZip(
    Object.entries(parts).map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })),
    new Date("2026-01-01T00:00:00Z"),
  );
  const book = await parseBookImport("anclas.epub", zip);
  expect(book.sections.map((section) => section.title)).toEqual(["El inicio", "El final"]);
  expect(book.sections[0]?.paragraphs[0]).toBe("Hola mundo\notra línea.");
  expect(JSON.stringify(book.sections[0]?.content)).toContain("hardBreak");
  expect(JSON.stringify(book.sections[0]?.content)).toContain("italic");
});

it("EPUB 2 recupera títulos desde NCX y conserva texto sin cabeceras", async () => {
  const parts: Record<string, string> = {
    "META-INF/container.xml":
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    "OPS/book.opf":
      '<package><metadata><title>Novela</title><creator>Ana</creator><creator>Luis</creator></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="a" href="a.xhtml"/></manifest><spine toc="ncx"><itemref idref="a"/></spine></package>',
    "OPS/toc.ncx":
      '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd"><ncx><navMap><navPoint><navLabel><text>El bosque</text></navLabel><content src="a.xhtml"/></navPoint></navMap></ncx>',
    "OPS/a.xhtml": "<html><body><p>Un bosque lleno de historias.</p></body></html>",
  };
  const zip = buildZip(
    Object.entries(parts).map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })),
    new Date("2026-01-01T00:00:00Z"),
  );
  const parsed = await parseBookImport("viejo.epub", zip);
  expect(parsed.authorName).toBe("Ana, Luis");
  expect(parsed.sections[0]?.title).toBe("El bosque");
});
it("DOCX extenso se divide sin perder párrafos ni formato básico", async () => {
  const paragraphs = Array.from(
    { length: 8000 },
    (_, index) =>
      `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Párrafo ${index} completo.</w:t></w:r></w:p>`,
  ).join("");
  const parsed = await parseBookImport(
    "extenso.docx",
    docxFromXml(`<w:document xmlns:w="urn:w"><w:body>${paragraphs}</w:body></w:document>`),
  );
  expect(parsed.sections.length).toBeGreaterThan(1);
  expect(parsed.sections.flatMap((section) => section.paragraphs)).toHaveLength(8000);
  expect(JSON.stringify(parsed.sections.at(-1)?.content)).toContain("Párrafo 7999 completo.");
  expect(JSON.stringify(parsed.sections.at(-1)?.content)).toContain("italic");
});

it.each([
  [10, 1000],
  [50, 4000],
])(
  "DOCX de %i capítulos conserva %i palabras por capítulo",
  async (chapters, words) => {
    const paragraph = "palabra ".repeat(words).trim();
    const content = Array.from(
      { length: chapters },
      (_, index) =>
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo ${index + 1}</w:t></w:r></w:p><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`,
    ).join("");
    const started = performance.now();
    const parsed = await parseBookImport(
      "novela-extensa.docx",
      docxFromXml(`<w:document xmlns:w="urn:w"><w:body>${content}</w:body></w:document>`),
    );
    const actual = parsed.sections.flatMap((section) => section.paragraphs).join(" ");
    expect(parsed.sections).toHaveLength(chapters);
    expect(actual.split(/\s+/u)).toHaveLength(chapters * words);
    expect(parsed.sections.every((section) => section.paragraphs.join(" ") === paragraph)).toBe(
      true,
    );
    console.info(
      `BENCH_IMPORT ${JSON.stringify({ chapters, words: chapters * words, ms: Math.round(performance.now() - started), rssMiB: Math.round(process.memoryUsage().rss / 1048576) })}`,
    );
  },
  60_000,
);

it("EPUB de 50 capítulos conserva orden y una señal única por capítulo", async () => {
  const chapters = Array.from({ length: 50 }, (_, index) => index + 1);
  const opf = `<?xml version="1.0"?><package><metadata><dc:title>Novela extensa</dc:title><dc:creator>Ana</dc:creator></metadata><manifest>${chapters.map((n) => `<item id="c${n}" href="c${n}.xhtml" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${chapters.map((n) => `<itemref idref="c${n}"/>`).join("")}</spine></package>`;
  const data = buildZip(
    [
      { name: "mimetype", data: new TextEncoder().encode("application/epub+zip"), first: true },
      {
        name: "META-INF/container.xml",
        data: new TextEncoder().encode(
          '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
        ),
      },
      { name: "OEBPS/book.opf", data: new TextEncoder().encode(opf) },
      ...chapters.map((n) => ({
        name: `OEBPS/c${n}.xhtml`,
        data: new TextEncoder().encode(
          `<html><body><h1>Capítulo ${n}</h1><p>Señal única ${n}.</p></body></html>`,
        ),
      })),
    ],
    new Date("2026-01-01T00:00:00Z"),
  );
  const parsed = await parseBookImport("novela.epub", data);
  expect(parsed.sections).toHaveLength(50);
  expect(parsed.sections.map((section) => section.paragraphs.join(" "))).toEqual(
    chapters.map((n) => `Señal única ${n}.`),
  );
});

it("PDF de diez páginas mantiene el texto seleccionable en orden de lectura", async () => {
  const pages: PdfDocument["pages"] = Array.from({ length: 10 }, (_, index) => ({
    widthMm: 148,
    heightMm: 210,
    runs: [
      { text: `Capítulo ${index + 1}`, font: "bold" as const, sizePt: 14, xMm: 18, baselineMm: 40 },
      {
        text: `Pasaje único ${index + 1}.`,
        font: "regular" as const,
        sizePt: 11,
        xMm: 18,
        baselineMm: 60,
      },
    ],
  }));
  const result = buildPdf({
    title: "PDF largo",
    author: "Ana",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    pages,
  });
  const parsed = await parseBookImport(
    "novela.pdf",
    result instanceof Uint8Array ? result : result.bytes,
  );
  const fullText = parsed.sections.flatMap((section) => section.paragraphs).join(" ");
  for (let index = 1; index <= 10; index++) expect(fullText).toContain(`Pasaje único ${index}.`);
  expect(fullText.indexOf("Pasaje único 1.")).toBeLessThan(fullText.indexOf("Pasaje único 10."));
});

it("no duplica un bloque grande cuando el documento conserva un párrafo vacío previo", async () => {
  const { splitOversizedSections } = await import("./importer");
  const large = "árbol ".repeat(35_000);
  const split = splitOversizedSections([
    {
      title: "Capítulo",
      type: "CHAPTER",
      paragraphs: [large],
      content: {
        type: "doc",
        content: [
          { type: "paragraph" },
          { type: "paragraph", content: [{ type: "text", text: large }] },
        ],
      },
    },
  ]);
  expect(split.flatMap((section) => section.paragraphs).join("")).toBe(large);
  expect(split.some((section) => section.simplified)).toBe(true);
});

it("DOCX conserva notas al pie, notas finales y enlaces seguros como contenido editable", async () => {
  const files: Record<string, string> = {
    "word/document.xml":
      '<w:document xmlns:w="urn:w" xmlns:r="urn:r"><w:body><w:p><w:r><w:t>Texto</w:t><w:footnoteReference w:id="1"/><w:endnoteReference w:id="1"/></w:r><w:hyperlink r:id="link"><w:r><w:t> Fuente</w:t></w:r></w:hyperlink></w:p></w:body></w:document>',
    "word/footnotes.xml":
      '<w:footnotes xmlns:w="urn:w"><w:footnote w:id="1"><w:p><w:r><w:t>Nota al pie.</w:t></w:r></w:p></w:footnote></w:footnotes>',
    "word/endnotes.xml":
      '<w:endnotes xmlns:w="urn:w"><w:endnote w:id="1"><w:p><w:r><w:t>Nota final.</w:t></w:r></w:p></w:endnote></w:endnotes>',
    "word/_rels/document.xml.rels":
      '<Relationships><Relationship Id="link" Target="https://example.org/fuente" Type="hyperlink"/></Relationships>',
  };
  const zip = buildZip(
    Object.entries(files).map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })),
    new Date("2026-01-01T00:00:00Z"),
  );
  const book = await parseBookImport("notas.docx", zip);
  const { parseTiptapDocument } = await import("@escribiendo/book-schema");
  const document = parseTiptapDocument(book.sections[0]?.content);
  const encoded = JSON.stringify(document);
  expect(encoded).toContain("Nota al pie.");
  expect(encoded).toContain("Nota final.");
  expect(encoded).toContain('"href":"https://example.org/fuente"');
});
