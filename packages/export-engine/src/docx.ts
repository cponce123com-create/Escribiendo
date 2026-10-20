import { buildZip, type ZipEntry } from "./zip";
import type { ExportDocumentModel } from "./epub";

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

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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

/** Párrafo de Word. */
function paragraph(text: string, styleId: string | null): string {
  const properties = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : "";

  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/**
 * Construye el DOCX.
 */
export function buildDocx(document: ExportDocumentModel, createdAt: Date): Uint8Array {
  const body: string[] = [];

  for (const chapter of document.chapters) {
    body.push(paragraph(chapter.title, "Ttulo1"));

    for (const block of chapter.blocks) {
      if (block.kind === "pageBreak") {
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        continue;
      }

      if (block.kind === "title") {
        body.push(paragraph(block.text, "Ttulo1"));
        continue;
      }

      if (block.kind === "heading") {
        body.push(paragraph(block.text, "Ttulo2"));
        continue;
      }

      if (block.kind === "quote") {
        body.push(paragraph(block.text, "Cita"));
        continue;
      }

      body.push(paragraph(block.text, null));
    }
  }

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: new TextEncoder().encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: new TextEncoder().encode(ROOT_RELS) },
    {
      name: "word/document.xml",
      data: new TextEncoder().encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n` +
          `<w:body>\n${body.join("\n")}\n` +
          `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>\n` +
          `</w:body>\n</w:document>\n`,
      ),
    },
    { name: "word/_rels/document.xml.rels", data: new TextEncoder().encode(DOCUMENT_RELS) },
    { name: "word/styles.xml", data: new TextEncoder().encode(STYLES) },
    {
      name: "docProps/core.xml",
      data: new TextEncoder().encode(coreProperties(document, createdAt)),
    },
    { name: "docProps/app.xml", data: new TextEncoder().encode(APP_PROPERTIES) },
  ];

  return buildZip(entries, createdAt);
}
