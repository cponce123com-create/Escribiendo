import { buildZip, type ZipEntry } from "./zip";

/**
 * EPUB 3.
 *
 * Un EPUB es un ZIP con una estructura concreta: la entrada `mimetype` debe
 * ir la primera y sin comprimir, `META-INF/container.xml` declara dónde está
 * el paquete, y el resto describe el contenido.
 */

export type ExportBlockKind = "title" | "heading" | "body" | "quote" | "pageBreak";

export interface ExportBlock {
  kind: ExportBlockKind;
  text: string;
}

export interface ExportChapter {
  id: string;
  title: string;
  blocks: ExportBlock[];
}

export interface ExportDocumentModel {
  title: string;
  author: string;
  language: string;
  /** Identificador único y estable de la obra. */
  identifier: string;
  chapters: ExportChapter[];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** Fecha de modificación en el formato que exige EPUB 3 (`CCYY-MM-DDThh:mm:ssZ`). */
function modifiedStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");

  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  );
}

const STYLES = `body { font-family: serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.8em; }
h2 { font-size: 1.25em; margin: 1.1em 0 0.6em; }
p { margin: 0 0 0.35em; text-indent: 1.2em; }
p.quote { margin-left: 1.5em; margin-right: 1.5em; font-style: italic; text-indent: 0; }
div.pagebreak { page-break-after: always; }`;

/** Cuerpo de un capítulo en XHTML. */
function chapterXhtml(chapter: ExportChapter, language: string): string {
  const body: string[] = [];

  for (const block of chapter.blocks) {
    if (block.kind === "pageBreak") {
      body.push('<div class="pagebreak"></div>');
      continue;
    }

    if (block.kind === "title") {
      body.push(`<h1>${escapeXml(block.text)}</h1>`);
      continue;
    }

    if (block.kind === "heading") {
      body.push(`<h2>${escapeXml(block.text)}</h2>`);
      continue;
    }

    if (block.kind === "quote") {
      body.push(`<p class="quote">${escapeXml(block.text)}</p>`);
      continue;
    }

    body.push(`<p>${escapeXml(block.text)}</p>`);
  }

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}">\n` +
    `<head>\n<title>${escapeXml(chapter.title)}</title>\n` +
    `<link rel="stylesheet" type="text/css" href="../style.css"/>\n</head>\n` +
    `<body>\n${body.join("\n")}\n</body>\n</html>\n`
  );
}

/**
 * Construye el EPUB 3.
 */
export function buildEpub(document: ExportDocumentModel, createdAt: Date): Uint8Array {
  const entries: ZipEntry[] = [];

  const chapters =
    document.chapters.length > 0
      ? document.chapters
      : [{ id: "c1", title: document.title, blocks: [] }];

  entries.push({
    name: "mimetype",
    data: new TextEncoder().encode("application/epub+zip"),
    first: true,
  });

  entries.push({
    name: "META-INF/container.xml",
    data: new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
        `  <rootfiles>\n` +
        `    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>\n` +
        `  </rootfiles>\n` +
        `</container>\n`,
    ),
  });

  const manifest: string[] = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="style" href="style.css" media-type="text/css"/>`,
  ];
  const spine: string[] = [];

  chapters.forEach((chapter, index) => {
    const id = `chapter-${String(index + 1).padStart(3, "0")}`;
    manifest.push(
      `    <item id="${id}" href="text/${id}.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spine.push(`    <itemref idref="${id}"/>`);
  });

  entries.push({
    name: "EPUB/package.opf",
    data: new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escapeXml(document.language)}">\n` +
        `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
        `    <dc:identifier id="pub-id">${escapeXml(document.identifier)}</dc:identifier>\n` +
        `    <dc:title>${escapeXml(document.title)}</dc:title>\n` +
        `    <dc:creator>${escapeXml(document.author)}</dc:creator>\n` +
        `    <dc:language>${escapeXml(document.language)}</dc:language>\n` +
        `    <meta property="dcterms:modified">${modifiedStamp(createdAt)}</meta>\n` +
        `  </metadata>\n` +
        `  <manifest>\n${manifest.join("\n")}\n  </manifest>\n` +
        `  <spine>\n${spine.join("\n")}\n  </spine>\n` +
        `</package>\n`,
    ),
  });

  const navItems = chapters
    .map(
      (chapter, index) =>
        `      <li><a href="text/chapter-${String(index + 1).padStart(3, "0")}.xhtml">${escapeXml(chapter.title)}</a></li>`,
    )
    .join("\n");

  entries.push({
    name: "EPUB/nav.xhtml",
    data: new TextEncoder().encode(
      `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<!DOCTYPE html>\n` +
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(document.language)}" xml:lang="${escapeXml(document.language)}">\n` +
        `<head>\n<title>Índice</title>\n</head>\n` +
        `<body>\n` +
        `  <nav epub:type="toc" id="toc">\n` +
        `    <h1>Índice</h1>\n` +
        `    <ol>\n${navItems}\n    </ol>\n` +
        `  </nav>\n` +
        `</body>\n</html>\n`,
    ),
  });

  entries.push({
    name: "EPUB/style.css",
    data: new TextEncoder().encode(STYLES),
  });

  chapters.forEach((chapter, index) => {
    const id = `chapter-${String(index + 1).padStart(3, "0")}`;
    entries.push({
      name: `EPUB/text/${id}.xhtml`,
      data: new TextEncoder().encode(chapterXhtml(chapter, document.language)),
    });
  });

  return buildZip(entries, createdAt);
}
