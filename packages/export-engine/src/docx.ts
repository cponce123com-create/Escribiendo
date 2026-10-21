import type { ExportImageAsset, ExportImageMap } from "./assets";
import { buildZip, type ZipEntry } from "./zip";
import type { ExportBlock, ExportDocumentModel, ExportInlineRun } from "./epub";

/**
 * DOCX.
 *
 * Un documento de Word es un ZIP con XML. Se genera con la estructura
 * mínima que Word necesita: tipos de contenido, relaciones, estilos,
 * propiedades y el documento en sí.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Ttulo1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Ttulo2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Cita">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720" w:right="720"/></w:pPr>
    <w:rPr><w:i/></w:rPr>
  </w:style>
</w:styles>`;

function coreProperties(document: ExportDocumentModel, createdAt: Date): string {
  const stamp = createdAt.toISOString().replace(/\.\d{3}Z$/u, "Z");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(document.title)}</dc:title>
  <dc:creator>${escapeXml(document.author)}</dc:creator>
  <dc:language>${escapeXml(document.language)}</dc:language>
  <dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>
</cp:coreProperties>`;
}

const APP_PROPERTIES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ESCRIBIENDO</Application>
</Properties>`;

/** Propiedades de un tramo: negrita, cursiva, subrayado, tachado, superíndice. */
function runXml(run: ExportInlineRun): string {
  const props: string[] = [];

  if (run.bold) {
    props.push("<w:b/>");
  }

  if (run.italic) {
    props.push("<w:i/>");
  }

  if (run.underline) {
    props.push('<w:u w:val="single"/>');
  }

  if (run.strike) {
    props.push("<w:strike/>");
  }

  if (run.superscript) {
    props.push('<w:vertAlign w:val="superscript"/>');
  }

  if (run.subscript) {
    props.push('<w:vertAlign w:val="subscript"/>');
  }

  const properties = props.length > 0 ? `<w:rPr>${props.join("")}</w:rPr>` : "";

  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

/**
 * Contenido de un párrafo con sus tramos.
 *
 * Los enlaces se agrupan en un solo hipervínculo para no repetir la relación
 * de Word en cada palabra: el identificador se registra una vez y se reutiliza.
 */
function inlineXml(block: ExportBlock, links: string[]): string {
  if (!block.runs || block.runs.length === 0) {
    return `<w:r><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r>`;
  }

  const parts: string[] = [];
  let index = 0;

  while (index < block.runs.length) {
    const run = block.runs[index];

    if (!run) {
      break;
    }

    if (run.link) {
      const href = run.link;
      const group: ExportInlineRun[] = [];

      while (index < block.runs.length && block.runs[index]?.link === href) {
        const current = block.runs[index];

        if (current) {
          group.push(current);
        }

        index += 1;
      }

      links.push(href);
      const id = `rIdL${links.length}`;
      const content = group.map((item) => runXml({ ...item, link: undefined })).join("");

      parts.push(`<w:hyperlink r:id="${id}" w:history="1">${content}</w:hyperlink>`);
      continue;
    }

    parts.push(runXml(run));
    index += 1;
  }

  return parts.join("");
}

interface DocxImageEntry {
  src: string;
  rId: string;
  fileName: string;
  asset: ExportImageAsset;
}

/** Ancho máximo de una imagen en un A4 con márgenes de 2,5 cm. */
const MAX_IMAGE_WIDTH_EMU = 5_486_400;
/** Alto máximo prudente para que una imagen quepa con su pie. */
const MAX_IMAGE_HEIGHT_EMU = 7_315_200;

function collectDocxImages(
  document: ExportDocumentModel,
  assets: ExportImageMap | undefined,
): Map<string, DocxImageEntry> {
  const bySrc = new Map<string, DocxImageEntry>();

  if (!assets) {
    return bySrc;
  }

  for (const chapter of document.chapters) {
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

      const index = bySrc.size + 1;
      const fileName = `image-${String(index).padStart(3, "0")}.${asset.extension}`;

      bySrc.set(src, {
        src,
        rId: `rIdImg${index}`,
        fileName,
        asset,
      });
    }
  }

  return bySrc;
}

/** Bloque de imagen OOXML, con su relación y su texto alternativo. */
function imageParagraph(
  block: ExportBlock,
  images: Map<string, DocxImageEntry>,
  nextId: number,
): string {
  const image = block.image;
  const src = image?.src;
  const entry = src ? images.get(src) : undefined;
  const caption = image?.caption ?? image?.alt ?? block.text;
  const alt = image?.alt ?? caption;

  if (!entry) {
    const fallback = caption.trim() || "Imagen no disponible";
    return paragraph(`[Imagen: ${fallback}]`, "Cita");
  }

  const widthPercent = Math.min(100, Math.max(10, image?.widthPercent ?? 100));
  let widthEmu = Math.round(MAX_IMAGE_WIDTH_EMU * (widthPercent / 100));
  let heightEmu = Math.round(widthEmu * (entry.asset.height / entry.asset.width));

  if (heightEmu > MAX_IMAGE_HEIGHT_EMU) {
    const scale = MAX_IMAGE_HEIGHT_EMU / heightEmu;
    heightEmu = MAX_IMAGE_HEIGHT_EMU;
    widthEmu = Math.round(widthEmu * scale);
  }

  const alignment =
    image?.alignment === "left" ? "left" : image?.alignment === "right" ? "right" : "center";
  const docPrId = 1000 + nextId;
  const captionXml =
    caption.trim().length > 0
      ? `<w:p><w:pPr><w:jc w:val="${alignment}"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(caption)}</w:t></w:r></w:p>`
      : "";

  return (
    `<w:p><w:pPr><w:jc w:val="${alignment}"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${widthEmu}" cy="${heightEmu}"/>` +
    `<wp:docPr id="${docPrId}" name="Imagen ${docPrId}" descr="${escapeXml(alt)}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${escapeXml(entry.fileName)}" descr="${escapeXml(alt)}"/>` +
    `<pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${entry.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
    captionXml
  );
}

/** Párrafo de Word. */
function paragraph(text: string, styleId: string | null): string {
  const properties = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : "";

  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/** Párrafo de Word a partir de un bloque con formato. */
function blockParagraph(block: ExportBlock, styleId: string | null, links: string[]): string {
  const properties = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : "";

  return `<w:p>${properties}${inlineXml(block, links)}</w:p>`;
}

/** Separador de escena: una línea horizontal de párrafo. */
const RULE_PARAGRAPH =
  '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr></w:pPr></w:p>';

/** Relaciones del documento, incluidas las de enlaces e imágenes. */
function documentRels(links: readonly string[], images: readonly DocxImageEntry[]): string {
  const hyperlinks = links
    .map(
      (href, index) =>
        `<Relationship Id="rIdL${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`,
    )
    .join("\n  ");
  const imageRels = images
    .map(
      (image) =>
        `<Relationship Id="${image.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.fileName}"/>`,
    )
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${hyperlinks.length > 0 ? `\n  ${hyperlinks}` : ""}${imageRels.length > 0 ? `\n  ${imageRels}` : ""}
</Relationships>`;
}

/**
 * Construye el DOCX.
 */
export function buildDocx(
  document: ExportDocumentModel,
  createdAt: Date,
  assets?: ExportImageMap,
): Uint8Array {
  const body: string[] = [];
  /** Enlaces del documento, para las relaciones de Word. */
  const links: string[] = [];
  const images = collectDocxImages(document, assets);
  let imageIndex = 0;

  for (const chapter of document.chapters) {
    body.push(paragraph(chapter.title, "Ttulo1"));

    for (const block of chapter.blocks) {
      if (block.kind === "pageBreak") {
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        continue;
      }

      if (block.kind === "rule") {
        body.push(RULE_PARAGRAPH);
        continue;
      }

      if (block.kind === "image") {
        imageIndex += 1;
        body.push(imageParagraph(block, images, imageIndex));
        continue;
      }

      if (block.kind === "title") {
        body.push(blockParagraph(block, "Ttulo1", links));
        continue;
      }

      if (block.kind === "heading") {
        body.push(blockParagraph(block, "Ttulo2", links));
        continue;
      }

      if (block.kind === "quote") {
        body.push(blockParagraph(block, "Cita", links));
        continue;
      }

      body.push(blockParagraph(block, null, links));
    }
  }

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: new TextEncoder().encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: new TextEncoder().encode(ROOT_RELS) },
    {
      name: "word/document.xml",
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">\n` +
          `<w:body>\n${body.join("\n")}\n` +
          `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>\n` +
          `</w:body>\n</w:document>\n`,
      ),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: new TextEncoder().encode(documentRels(links, [...images.values()])),
    },
    { name: "word/styles.xml", data: new TextEncoder().encode(STYLES) },
    {
      name: "docProps/core.xml",
      data: new TextEncoder().encode(coreProperties(document, createdAt)),
    },
    { name: "docProps/app.xml", data: new TextEncoder().encode(APP_PROPERTIES) },
  ];

  for (const image of images.values()) {
    entries.push({
      name: `word/media/${image.fileName}`,
      data: image.asset.data,
    });
  }

  return buildZip(entries, createdAt);
}
