import { describe, expect, it } from "vitest";
import { buildEpub, type ExportDocumentModel } from "./epub";
import { buildDocx } from "./docx";

const DOCUMENTO: ExportDocumentModel = {
  title: "El velo de la tarde",
  author: "Ana Torres",
  language: "es",
  identifier: "urn:uuid:6f1c2b7a-0000-4000-8000-000000000000",
  chapters: [
    {
      id: "c1",
      title: "El velo de la tarde",
      blocks: [
        { kind: "title", text: "El velo de la tarde" },
        { kind: "body", text: "Caía la tarde sobre la plaza." },
        { kind: "heading", text: "Un aparte" },
        { kind: "quote", text: "El tiempo no pasa: se queda." },
      ],
    },
    {
      id: "c2",
      title: "Marta",
      blocks: [
        { kind: "body", text: "Marta cerró la puerta de la librería." },
        { kind: "pageBreak", text: "" },
        { kind: "body", text: "Y esperó." },
      ],
    },
  ],
};

const FECHA = new Date("2026-10-20T10:00:00.000Z");

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

/** Extrae el texto de una entrada de un ZIP. */
function entryText(bytes: Uint8Array, name: string): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 0;

  while (position + 4 <= bytes.length) {
    if (view.getUint32(position, true) !== 0x04034b50) {
      break;
    }

    const size = view.getUint32(position + 18, true);
    const nameLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const nameStart = position + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const entryName = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));

    if (entryName === name) {
      return new TextDecoder().decode(bytes.slice(dataStart, dataStart + size));
    }

    position = dataStart + size;
  }

  return null;
}

function entryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  let position = 0;

  while (position + 4 <= bytes.length) {
    if (view.getUint32(position, true) !== 0x04034b50) {
      break;
    }

    const size = view.getUint32(position + 18, true);
    const nameLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const nameStart = position + 30;
    const dataStart = nameStart + nameLength + extraLength;

    names.push(new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength)));
    position = dataStart + size;
  }

  return names;
}

describe("buildEpub", () => {
  const bytes = buildEpub(DOCUMENTO, FECHA);

  it("coloca la entrada mimetype la primera y sin comprimir", () => {
    const names = entryNames(bytes);

    expect(names[0]).toBe("mimetype");
    expect(entryText(bytes, "mimetype")).toBe("application/epub+zip");
  });

  it("declara el punto de entrada del paquete", () => {
    const container = entryText(bytes, "META-INF/container.xml") ?? "";

    expect(container).toContain('full-path="EPUB/package.opf"');
    expect(container).toContain('media-type="application/oebps-package+xml"');
  });

  it("describe la obra en el paquete", () => {
    const opf = entryText(bytes, "EPUB/package.opf") ?? "";

    expect(opf).toContain('version="3.0"');
    expect(opf).toContain(`<dc:title>El velo de la tarde</dc:title>`);
    expect(opf).toContain(`<dc:creator>Ana Torres</dc:creator>`);
    expect(opf).toContain(`<dc:language>es</dc:language>`);
    expect(opf).toContain(`<dc:identifier id="pub-id">${DOCUMENTO.identifier}</dc:identifier>`);
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-20T10:00:00Z</meta>');
  });

  it("incluye cada capítulo en el manifiesto y en el spine", () => {
    const opf = entryText(bytes, "EPUB/package.opf") ?? "";

    expect(opf).toContain(`<item id="chapter-001" href="text/chapter-001.xhtml"`);
    expect(opf).toContain(`<item id="chapter-002" href="text/chapter-002.xhtml"`);
    expect(opf).toContain(`<itemref idref="chapter-001"/>`);
    expect(opf).toContain(`<itemref idref="chapter-002"/>`);
  });

  it("escribe el contenido de los capítulos en XHTML", () => {
    const capitulo = entryText(bytes, "EPUB/text/chapter-001.xhtml") ?? "";

    expect(capitulo).toContain("<h1>El velo de la tarde</h1>");
    expect(capitulo).toContain("<p>Caía la tarde sobre la plaza.</p>");
    expect(capitulo).toContain("<h2>Un aparte</h2>");
    expect(capitulo).toContain(`<p class="quote">El tiempo no pasa: se queda.</p>`);
    expect(capitulo).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
  });

  it("escribe la navegación con el índice de capítulos", () => {
    const nav = entryText(bytes, "EPUB/nav.xhtml") ?? "";

    expect(nav).toContain(`<nav epub:type="toc"`);
    expect(nav).toContain(`<a href="text/chapter-001.xhtml">El velo de la tarde</a>`);
    expect(nav).toContain(`<a href="text/chapter-002.xhtml">Marta</a>`);
  });

  it("escapa los caracteres especiales del XML", () => {
    const conXml = buildEpub(
      {
        ...DOCUMENTO,
        chapters: [
          {
            id: "c1",
            title: "A & B",
            blocks: [{ kind: "body", text: "un <b>con</b> & otro" }],
          },
        ],
      },
      FECHA,
    );

    const capitulo = entryText(conXml, "EPUB/text/chapter-001.xhtml") ?? "";

    expect(capitulo).toContain("A &amp; B");
    expect(capitulo).toContain("un &lt;b&gt;con&lt;/b&gt; &amp; otro");
  });

  it("genera el mismo archivo para el mismo documento", () => {
    expect(equals(buildEpub(DOCUMENTO, FECHA), bytes)).toBe(true);
  });
});

describe("buildDocx", () => {
  const bytes = buildDocx(DOCUMENTO, FECHA);

  it("incluye las partes obligatorias de un documento de Word", () => {
    const names = entryNames(bytes);

    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("_rels/.rels");
    expect(names).toContain("word/document.xml");
    expect(names).toContain("word/_rels/document.xml.rels");
    expect(names).toContain("word/styles.xml");
    expect(names).toContain("docProps/core.xml");
  });

  it("declara los tipos de contenido", () => {
    const tipos = entryText(bytes, "[Content_Types].xml") ?? "";

    expect(tipos).toContain("wordprocessingml.document.main+xml");
    expect(tipos).toContain("wordprocessingml.styles+xml");
  });

  it("escribe el contenido con los estilos correspondientes", () => {
    const documento = entryText(bytes, "word/document.xml") ?? "";

    expect(documento).toContain('<w:pStyle w:val="Ttulo1"/>');
    expect(documento).toContain('<w:pStyle w:val="Ttulo2"/>');
    expect(documento).toContain('<w:pStyle w:val="Cita"/>');
    expect(documento).toContain('<w:t xml:space="preserve">Caía la tarde sobre la plaza.</w:t>');
  });

  it("conserva los saltos de página", () => {
    const documento = entryText(bytes, "word/document.xml") ?? "";

    expect(documento).toContain(`<w:br w:type="page"/>`);
  });

  it("escribe las propiedades del documento", () => {
    const propiedades = entryText(bytes, "docProps/core.xml") ?? "";

    expect(propiedades).toContain("<dc:title>El velo de la tarde</dc:title>");
    expect(propiedades).toContain("<dc:creator>Ana Torres</dc:creator>");
    expect(propiedades).toContain("2026-10-20T10:00:00Z");
  });

  it("genera el mismo archivo para el mismo documento", () => {
    expect(equals(buildDocx(DOCUMENTO, FECHA), bytes)).toBe(true);
  });
});
