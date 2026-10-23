import type { ExportImage, ExportImageAsset, ExportImageMap } from "./assets";
import { buildZip, type ZipEntry } from "./zip";
import { escapeXml, esEnlaceSeguro } from "./xml";

/**
 * EPUB 3.
 *
 * Un EPUB es un ZIP con una estructura concreta: la entrada `mimetype` debe
 * ir la primera y sin comprimir, `META-INF/container.xml` declara dónde está
 * el paquete, y el resto describe el contenido.
 */

export type ExportBlockKind =
  "title" | "heading" | "body" | "quote" | "pageBreak" | "rule" | "image";

/** Nota al pie dentro de un tramo en línea. */
export interface ExportFootnote {
  id: string;
  number: number;
  note: string;
}

/** Tramo de texto con formato en línea, para el EPUB y el DOCX. */
export interface ExportInlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  link?: string;
  footnote?: ExportFootnote;
}

export interface ExportBlock {
  kind: ExportBlockKind;
  text: string;
  /** Tramos con formato. Si falta, se usa `text` tal cual. */
  runs?: ExportInlineRun[];
  /** Referencia de la imagen, cuando `kind` es `image`. */
  image?: ExportImage;
}

export interface ExportChapter {
  id: string;
  title: string;
  /** `false` evita agregar automáticamente el título de la sección. */
  showTitle?: boolean;
  /** Compone una inicial destacada en el primer párrafo del capítulo. */
  dropCap?: boolean;
  blocks: ExportBlock[];
}

export interface ExportDocumentModel {
  title: string;
  author: string;
  language: string;
  /** Identificador único y estable de la obra. */
  identifier: string;
  chapters: ExportChapter[];
  cover?: ExportImage;
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
.chapter-title { text-align: center; break-before: page; page-break-before: always; }
h2 { font-size: 1.25em; margin: 1.1em 0 0.6em; }
p { margin: 0 0 0.35em; text-indent: 1.2em; }
p.drop-cap::first-letter { float: left; font-size: 3em; line-height: 0.85; padding-right: 0.08em; }
p.quote { margin-left: 1.5em; margin-right: 1.5em; font-style: italic; text-indent: 0; }
hr.scene { border: 0; text-align: center; margin: 1.2em 0; }
hr.scene::after { content: "* * *"; letter-spacing: 0.4em; }
figure.image { margin: 1.2em auto; text-align: center; }
figure.image.align-left { margin-left: 0; margin-right: auto; text-align: left; }
figure.image.align-right { margin-left: auto; margin-right: 0; text-align: right; }
figure.image img { max-width: 100%; height: auto; }
figure.image figcaption, p.image-alt { font-size: 0.9em; font-style: italic; text-align: center; text-indent: 0; }
body.cover-page { margin: 0; padding: 0; text-align: center; }
body.cover-page img { display: block; width: 100%; height: 100vh; object-fit: contain; }
div.pagebreak { page-break-after: always; }
a.footnote-ref { text-decoration: none; }
section.footnotes { margin-top: 2em; font-size: 0.82em; line-height: 1.35; }
section.footnotes hr { border: 0; border-top: 1px solid #777; width: 35%; margin: 0 0 1em; }
section.footnotes ol { padding-left: 1.4em; }
section.footnotes li { margin-bottom: 0.6em; }
a.footnote-back { text-decoration: none; }`;

/** Un tramo con sus etiquetas de formato. */
function inlineHtml(run: ExportInlineRun): string {
  if (run.footnote) {
    const id = escapeXml(run.footnote.id);

    return (
      `<a class="footnote-ref" epub:type="noteref" href="#fn-${id}" id="fnref-${id}">` +
      `<sup>${run.footnote.number}</sup></a>`
    );
  }

  let html = escapeXml(run.text);

  if (run.subscript) {
    html = `<sub>${html}</sub>`;
  } else if (run.superscript) {
    html = `<sup>${html}</sup>`;
  }

  if (run.strike) {
    html = `<s>${html}</s>`;
  }

  if (run.underline) {
    html = `<u>${html}</u>`;
  }

  if (run.italic) {
    html = `<em>${html}</em>`;
  }

  if (run.bold) {
    html = `<strong>${html}</strong>`;
  }

  if (run.link && esEnlaceSeguro(run.link)) {
    html = `<a href="${escapeXml(run.link)}">${html}</a>`;
  }

  return html;
}

/** Contenido en línea de un bloque, con o sin formato. */
function inlineContent(block: ExportBlock): string {
  if (!block.runs || block.runs.length === 0) {
    return escapeXml(block.text);
  }

  return block.runs.map(inlineHtml).join("");
}

/** Notas de un capítulo, en orden de aparición y sin repetir. */
function chapterFootnotes(chapter: ExportChapter): ExportFootnote[] {
  const notes: ExportFootnote[] = [];
  const known = new Set<string>();

  for (const block of chapter.blocks) {
    for (const run of block.runs ?? []) {
      if (run.footnote && !known.has(run.footnote.id)) {
        known.add(run.footnote.id);
        notes.push(run.footnote);
      }
    }
  }

  return notes;
}

/** Cuerpo de un capítulo en XHTML. */
function chapterXhtml(
  chapter: ExportChapter,
  language: string,
  imageHrefs: ReadonlyMap<string, string>,
): string {
  const body: string[] = [];

  const footnotes = chapterFootnotes(chapter);

  if (chapter.showTitle !== false) {
    body.push(`<h1 class="chapter-title">${escapeXml(chapter.title)}</h1>`);
  }

  let dropCapApplied = false;
  for (const block of chapter.blocks) {
    if (block.kind === "pageBreak") {
      body.push('<div class="pagebreak"></div>');
      continue;
    }

    if (block.kind === "rule") {
      body.push('<hr class="scene"/>');
      continue;
    }

    if (block.kind === "image") {
      const src = block.image?.src;
      const alt = block.image?.alt ?? block.text;
      const caption = block.image?.caption ?? alt;
      const alignment = block.image?.alignment ?? "center";
      const widthPercent = Math.min(100, Math.max(10, block.image?.widthPercent ?? 100));
      const embedded = src ? imageHrefs.get(src) : undefined;

      if (src) {
        body.push(
          `<figure class="image align-${escapeXml(alignment)}" style="width: ${widthPercent}%">` +
            `<img src="${escapeXml(embedded ?? src)}" alt="${escapeXml(alt || caption || "Imagen del libro")}"/>` +
            (caption.length > 0 ? `<figcaption>${escapeXml(caption)}</figcaption>` : "") +
            `</figure>`,
        );
      } else if (caption.length > 0) {
        body.push(`<p class="image-alt">${escapeXml(caption)}</p>`);
      }

      continue;
    }

    if (block.kind === "title") {
      body.push(`<h1>${inlineContent(block)}</h1>`);
      continue;
    }

    if (block.kind === "heading") {
      body.push(`<h2>${inlineContent(block)}</h2>`);
      continue;
    }

    if (block.kind === "quote") {
      body.push(`<p class="quote">${inlineContent(block)}</p>`);
      continue;
    }

    const dropCapClass = chapter.dropCap && !dropCapApplied && block.kind === "body";
    if (dropCapClass) dropCapApplied = true;
    body.push(`<p${dropCapClass ? ' class="drop-cap"' : ""}>${inlineContent(block)}</p>`);
  }

  if (footnotes.length > 0) {
    body.push('<section class="footnotes" epub:type="footnotes">');
    body.push("<hr/>");
    body.push("<ol>");

    for (const note of footnotes) {
      body.push(
        `<li id="fn-${escapeXml(note.id)}" epub:type="footnote">` +
          `<p><a class="footnote-back" href="#fnref-${escapeXml(note.id)}">${note.number}.</a> ` +
          `${escapeXml(note.note)}</p></li>`,
      );
    }

    body.push("</ol>");
    body.push("</section>");
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

interface EmbeddedImageEntry {
  src: string;
  href: string;
  fileName: string;
  asset: ExportImageAsset;
}

/**
 * Resuelve las imágenes que se van a incrustar y les asigna un nombre estable.
 *
 * El nombre depende del orden de aparición, no de la URL: así el paquete no
 * filtra identificadores de Cloudinary y dos exportaciones del mismo
 * manuscrito producen el mismo ZIP.
 */
function collectEmbeddedImages(
  chapters: readonly ExportChapter[],
  assets: ExportImageMap | undefined,
): { bySrc: Map<string, string>; entries: EmbeddedImageEntry[] } {
  const bySrc = new Map<string, string>();
  const entries: EmbeddedImageEntry[] = [];

  if (!assets) {
    return { bySrc, entries };
  }

  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      if (block.kind !== "image") {
        continue;
      }

      const src = block.image?.src;

      if (!src || bySrc.has(src)) {
        continue;
      }

      const asset = assets.get(src);

      if (!asset) {
        continue;
      }

      const index = entries.length + 1;
      const fileName = `image-${String(index).padStart(3, "0")}.${asset.extension}`;
      const href = `../images/${fileName}`;

      bySrc.set(src, href);
      entries.push({ src, href, fileName, asset });
    }
  }

  return { bySrc, entries };
}

function coverXhtml(document: ExportDocumentModel, href: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(document.language)}" xml:lang="${escapeXml(document.language)}">\n` +
    `<head><title>${escapeXml(document.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n` +
    `<body class="cover-page"><img src="${escapeXml(href)}" alt="${escapeXml(document.cover?.alt ?? `Portada de ${document.title}`)}" /></body>\n` +
    `</html>\n`
  );
}

/**
 * Construye el EPUB 3.
 *
 * Las imágenes se incrustan cuando la aplicación ha resuelto sus bytes. Si
 * alguna no se puede resolver, se conserva la referencia remota y el capítulo
 * declara `remote-resources`, de modo que el lector sepa que necesita red.
 */
export function buildEpub(
  document: ExportDocumentModel,
  createdAt: Date,
  assets?: ExportImageMap,
): Uint8Array {
  const entries: ZipEntry[] = [];

  const chapters =
    document.chapters.length > 0
      ? document.chapters
      : [{ id: "c1", title: document.title, blocks: [] }];

  const embedded = collectEmbeddedImages(chapters, assets);
  const coverAsset = document.cover?.src ? assets?.get(document.cover.src) : undefined;
  const coverFileName = coverAsset ? `cover.${coverAsset.extension}` : null;

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

  if (coverAsset && coverFileName) {
    manifest.push(
      `    <item id="cover-image" href="images/${coverFileName}" media-type="${escapeXml(coverAsset.mimeType)}" properties="cover-image"/>`,
      `    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spine.push(`    <itemref idref="cover" linear="no"/>`);
  }

  chapters.forEach((chapter, index) => {
    const id = `chapter-${String(index + 1).padStart(3, "0")}`;
    const tieneRemotas = chapter.blocks.some(
      (block) =>
        block.kind === "image" &&
        typeof block.image?.src === "string" &&
        !embedded.bySrc.has(block.image.src) &&
        /^https?:/u.test(block.image.src),
    );

    manifest.push(
      `    <item id="${id}" href="text/${id}.xhtml" media-type="application/xhtml+xml"${
        tieneRemotas ? ' properties="remote-resources"' : ""
      }/>`,
    );
    spine.push(`    <itemref idref="${id}"/>`);
  });

  embedded.entries.forEach((entry, index) => {
    manifest.push(
      `    <item id="image-${String(index + 1).padStart(3, "0")}" href="images/${entry.fileName}" media-type="${escapeXml(entry.asset.mimeType)}"/>`,
    );
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

  if (coverAsset && coverFileName) {
    entries.push({
      name: "EPUB/cover.xhtml",
      data: new TextEncoder().encode(coverXhtml(document, `images/${coverFileName}`)),
    });
    entries.push({ name: `EPUB/images/${coverFileName}`, data: coverAsset.data });
  }

  chapters.forEach((chapter, index) => {
    const id = `chapter-${String(index + 1).padStart(3, "0")}`;
    entries.push({
      name: `EPUB/text/${id}.xhtml`,
      data: new TextEncoder().encode(chapterXhtml(chapter, document.language, embedded.bySrc)),
    });
  });

  for (const entry of embedded.entries) {
    entries.push({
      name: `EPUB/images/${entry.fileName}`,
      data: entry.asset.data,
    });
  }

  return buildZip(entries, createdAt);
}
