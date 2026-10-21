import { describe, expect, it } from "vitest";
import { buildDocx } from "./docx";
import { buildEpub, type ExportDocumentModel } from "./epub";
import { buildPdf, type PdfResult } from "./pdf";

const FECHA = new Date("2026-10-21T10:00:00.000Z");

const DOCUMENTO: ExportDocumentModel = {
  title: "Notas de la travesía",
  author: "Ana Torres",
  language: "es",
  identifier: "urn:uuid:6f1c2b7a-0000-4000-8000-000000000001",
  chapters: [
    {
      id: "c1",
      title: "Primera travesía",
      blocks: [
        {
          kind: "body",
          text: "Una llamada1 en el cuerpo.",
          runs: [
            { text: "Una llamada" },
            {
              text: "1",
              superscript: true,
              footnote: {
                id: "nota-1-1",
                number: 1,
                note: "Texto de la nota al pie.",
              },
            },
            { text: " en el cuerpo." },
          ],
        },
      ],
    },
  ],
};

function zipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  let position = 0;

  while (position + 4 <= bytes.length && view.getUint32(position, true) === 0x04034b50) {
    const size = view.getUint32(position + 18, true);
    const nameLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const nameStart = position + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));

    entries.set(name, bytes.slice(dataStart, dataStart + size));
    position = dataStart + size;
  }

  return entries;
}

function textEntry(entries: Map<string, Uint8Array>, name: string): string {
  const data = entries.get(name);

  if (!data) {
    throw new Error(`Falta la entrada ${name}`);
  }

  return new TextDecoder().decode(data);
}

function latin1(result: PdfResult | Uint8Array): string {
  const bytes = result instanceof Uint8Array ? result : result.bytes;

  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

describe("notas al pie en EPUB", () => {
  it("genera noteref y una nota accesible en el capítulo", () => {
    const entries = zipEntries(buildEpub(DOCUMENTO, FECHA));
    const chapter = textEntry(entries, "EPUB/text/chapter-001.xhtml");

    expect(chapter).toContain('epub:type="noteref"');
    expect(chapter).toContain('href="#fn-nota-1-1"');
    expect(chapter).toContain('id="fn-nota-1-1"');
    expect(chapter).toContain('epub:type="footnote"');
    expect(chapter).toContain("Texto de la nota al pie.");
    expect(chapter).toContain('href="#fnref-nota-1-1"');
  });
});

describe("notas al pie en DOCX", () => {
  it("añade footnotes.xml, la relación y la referencia en el cuerpo", () => {
    const entries = zipEntries(buildDocx(DOCUMENTO, FECHA));
    const document = textEntry(entries, "word/document.xml");
    const footnotes = textEntry(entries, "word/footnotes.xml");
    const rels = textEntry(entries, "word/_rels/document.xml.rels");
    const types = textEntry(entries, "[Content_Types].xml");

    expect(document).toContain('<w:footnoteReference w:id="1"/>');
    expect(footnotes).toContain('<w:footnote w:id="1">');
    expect(footnotes).toContain("Texto de la nota al pie.");
    expect(footnotes).toContain('w:type="separator"');
    expect(rels).toContain("relationships/footnotes");
    expect(types).toContain("/word/footnotes.xml");
  });
});

describe("notas al pie en PDF", () => {
  it("dibuja la línea separadora y conserva el texto de la nota", () => {
    const result = buildPdf({
      title: "Notas",
      author: "Ana Torres",
      createdAt: FECHA,
      pages: [
        {
          widthMm: 148,
          heightMm: 210,
          runs: [
            {
              text: "1. Texto de la nota al pie.",
              font: "regular",
              sizePt: 8,
              xMm: 18,
              baselineMm: 180,
            },
          ],
          rules: [{ x1Mm: 18, y1Mm: 171, x2Mm: 58, y2Mm: 171, widthPt: 0.5 }],
        },
      ],
    });
    const text = latin1(result);

    expect(text).toContain("(1. Texto de la nota al pie.)");
    expect(text).toMatch(/\d+\.\d+ \d+\.\d+ m \d+\.\d+ \d+\.\d+ l S/u);
  });
});
