import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ExportImageAsset } from "./assets";
import { buildDocx } from "./docx";
import { buildEpub, type ExportDocumentModel } from "./epub";
import { buildPdf } from "./pdf";
import { pdfContent, zipEntries as leerZip, type ZipEntryLeida } from "./test-utils";

const FECHA = new Date("2026-10-20T10:00:00.000Z");
const SRC = "https://res.cloudinary.com/demo/image/upload/v1/plaza.jpg";

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
        {
          kind: "image",
          text: "La plaza al anochecer",
          image: {
            src: SRC,
            alt: "La plaza al anochecer",
            caption: "La plaza, desde el balcón.",
            widthPx: 1200,
            heightPx: 800,
            widthPercent: 75,
            alignment: "center",
          },
        },
      ],
    },
  ],
};

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const data = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();

  return new Uint8Array(data);
}

async function asset(width = 120, height = 80): Promise<ExportImageAsset> {
  return {
    data: await jpeg(width, height),
    mimeType: "image/jpeg",
    extension: "jpg",
    width,
    height,
  };
}

function zipEntries(bytes: Uint8Array): Map<string, ZipEntryLeida> {
  return leerZip(bytes);
}

function textEntry(entries: Map<string, ZipEntryLeida>, name: string): string {
  const entry = entries.get(name);

  if (!entry) {
    throw new Error(`Falta la entrada ${name}`);
  }

  return new TextDecoder().decode(entry.data);
}

/** PDF con los flujos desplegados: las pruebas miran el contenido real. */
function contenido(bytes: Uint8Array): string {
  return pdfContent(bytes);
}

describe("imágenes en PDF", () => {
  it("incrusta un JPEG como XObject y lo dibuja en la página", async () => {
    const image = await asset();
    const result = buildPdf({
      title: "Con imagen",
      author: "Ana Torres",
      createdAt: FECHA,
      pages: [
        {
          widthMm: 148,
          heightMm: 210,
          runs: [],
          images: [
            {
              topMm: 30,
              xMm: 20,
              widthMm: 80,
              heightMm: 53.33,
              data: image.data,
              pixelWidth: image.width,
              pixelHeight: image.height,
              alt: "La plaza",
            },
          ],
        },
      ],
    });
    const text = contenido(result.bytes);

    expect(result.imagenesIncrustadas).toBe(1);
    expect(result.imagenesOmitidas).toBe(0);
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 120");
    expect(text).toContain("/Height 80");
    expect(text).toContain("/Im1 Do");
    expect(text).toContain("/XObject << /Im1");
  });

  it("deja un marcador visible cuando la imagen no se ha resuelto", () => {
    const result = buildPdf({
      title: "Sin imagen",
      author: "Ana Torres",
      createdAt: FECHA,
      pages: [
        {
          widthMm: 148,
          heightMm: 210,
          runs: [],
          images: [
            {
              topMm: 30,
              xMm: 20,
              widthMm: 80,
              heightMm: 50,
              alt: "La plaza",
            },
          ],
        },
      ],
    });
    const text = contenido(result.bytes);

    expect(result.imagenesIncrustadas).toBe(0);
    expect(result.imagenesOmitidas).toBe(1);
    expect(text).toContain("(La plaza)");
  });
});

describe("imágenes en EPUB", () => {
  it("incrusta el archivo y usa una ruta relativa en el capítulo", async () => {
    const image = await asset();
    const bytes = buildEpub(DOCUMENTO, FECHA, new Map([[SRC, image]]));
    const entries = zipEntries(bytes);
    const opf = textEntry(entries, "EPUB/package.opf");
    const chapter = textEntry(entries, "EPUB/text/chapter-001.xhtml");

    expect(entries.has("EPUB/images/image-001.jpg")).toBe(true);
    expect(opf).toContain('href="images/image-001.jpg"');
    expect(opf).toContain('media-type="image/jpeg"');
    expect(opf).not.toContain("remote-resources");
    expect(chapter).toContain('src="../images/image-001.jpg"');
    expect(chapter).toContain("<figcaption>La plaza, desde el balcón.</figcaption>");
  });

  it("conserva la referencia remota cuando no hay bytes", () => {
    const bytes = buildEpub(DOCUMENTO, FECHA);
    const entries = zipEntries(bytes);
    const opf = textEntry(entries, "EPUB/package.opf");
    const chapter = textEntry(entries, "EPUB/text/chapter-001.xhtml");

    expect(opf).toContain('properties="remote-resources"');
    expect(chapter).toContain(`src="${SRC}"`);
  });
});

describe("imágenes en DOCX", () => {
  it("añade el medio, la relación y el dibujo OOXML", async () => {
    const image = await asset();
    const bytes = buildDocx(DOCUMENTO, FECHA, new Map([[SRC, image]]));
    const entries = zipEntries(bytes);
    const rels = textEntry(entries, "word/_rels/document.xml.rels");
    const document = textEntry(entries, "word/document.xml");

    expect(entries.has("word/media/image-001.jpg")).toBe(true);
    expect(rels).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"',
    );
    expect(rels).toContain('Target="media/image-001.jpg"');
    expect(document).toContain('r:embed="rIdImg1"');
    expect(document).toContain("<wp:extent");
    expect(document).toContain("La plaza al anochecer");
    expect(document).toContain("La plaza, desde el balcón.");
  });

  it("deja el texto alternativo cuando la imagen no está disponible", () => {
    const bytes = buildDocx(DOCUMENTO, FECHA);
    const entries = zipEntries(bytes);
    const document = textEntry(entries, "word/document.xml");

    expect(document).toContain("[Imagen: La plaza, desde el balcón.]");
  });
});
