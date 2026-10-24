import "server-only";
import { posix } from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
  parse as parseHtml,
  NodeType,
  type HTMLElement,
  type Node as HtmlNode,
} from "node-html-parser";
import * as yauzl from "yauzl";

export const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_TEXT_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_SECTIONS = 200;
const MAX_ZIP_ENTRIES = 10_000;
const MAX_ZIP_ENTRY_BYTES = 3 * 1024 * 1024;
const MAX_ZIP_TEXT_BYTES = 24 * 1024 * 1024;
const MAX_SECTION_TEXT_BYTES = 1_700_000;

export type ImportFormat = "epub" | "docx" | "pdf";

export interface ImportedSection {
  title: string;
  paragraphs: string[];
}

export interface ParsedBookImport {
  format: ImportFormat;
  title?: string;
  authorName?: string;
  language?: string;
  sections: ImportedSection[];
}

export class BookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookImportError";
  }
}

interface TextBlock {
  text: string;
  heading?: boolean;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
});

const HTML_BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
]);
const HTML_SKIP_TAGS = new Set(["script", "style", "nav", "noscript", "svg"]);
const CHAPTER_HEADING =
  /^(?:cap[ií]tulo|chapter|chapitre|capitolo|parte|part|pr[oó]logo|ep[ií]logo|introducci[oó]n|interludio|ap[eé]ndice|anexo)(?:\s|:|$)/iu;

function localName(name: string): string {
  return name.replace(/^@_/u, "").split(":").at(-1)?.toLowerCase() ?? name.toLowerCase();
}

function child(value: unknown, name: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entry = Object.entries(value).find(
    ([key]) => !key.startsWith("@_") && localName(key) === name.toLowerCase(),
  );
  return entry?.[1];
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function attribute(value: unknown, name: string): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entry = Object.entries(value).find(
    ([key]) => key.startsWith("@_") && localName(key) === name.toLowerCase(),
  );
  return typeof entry?.[1] === "string" ? entry[1] : undefined;
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textValue).join("");
  if (value === null || typeof value !== "object") return "";
  return Object.entries(value)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, nested]) => textValue(nested))
    .join("");
}

function parseXml(xml: string): Record<string, unknown> {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new BookImportError("El archivo incluye declaraciones XML no permitidas.");
  }

  return xmlParser.parse(xml) as Record<string, unknown>;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/\u00a0/gu, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .replace(/[\t ]+/gu, " ")
    .trim();
}

function paragraphsFromBlock(text: string): string[] {
  return text
    .split(/\n\s*\n/gu)
    .map(normalizeText)
    .filter(Boolean);
}

function splitBlocksIntoSections(blocks: TextBlock[], defaultTitle: string): ImportedSection[] {
  const sections: ImportedSection[] = [];
  let title = defaultTitle;
  let paragraphs: string[] = [];

  const flush = () => {
    const clean = paragraphs.flatMap(paragraphsFromBlock).filter(Boolean);
    if (clean.length > 0) sections.push({ title: title.slice(0, 300), paragraphs: clean });
    paragraphs = [];
  };

  for (const block of blocks) {
    const text = normalizeText(block.text);
    if (!text) continue;

    if (block.heading || CHAPTER_HEADING.test(text)) {
      if (paragraphs.length > 0) {
        flush();
      }
      title = text;
      continue;
    }

    paragraphs.push(text);
  }

  flush();
  return sections;
}

function splitOversizedSections(sections: ImportedSection[]): ImportedSection[] {
  const result: ImportedSection[] = [];

  for (const section of sections) {
    let current: string[] = [];
    let currentBytes = 0;
    let part = 1;

    const flush = () => {
      if (current.length === 0) return;
      const title = part === 1 ? section.title : `${section.title} (continuación ${part})`;
      result.push({ title: title.slice(0, 300), paragraphs: current });
      current = [];
      currentBytes = 0;
      part += 1;
    };

    for (const paragraph of section.paragraphs) {
      const chunks: string[] = [];
      let remainder = paragraph;
      while (Buffer.byteLength(remainder, "utf8") > MAX_SECTION_TEXT_BYTES) {
        const bytes = Buffer.from(remainder, "utf8");
        let end = MAX_SECTION_TEXT_BYTES;
        while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
        let chunk = bytes.subarray(0, end).toString("utf8");
        const safeBoundary = chunk.lastIndexOf(" ");
        if (safeBoundary > chunk.length * 0.7) chunk = chunk.slice(0, safeBoundary);
        chunks.push(chunk.trim());
        remainder = remainder.slice(chunk.length).trim();
      }
      if (remainder) chunks.push(remainder);

      for (const chunk of chunks) {
        const bytes = Buffer.byteLength(chunk, "utf8");
        if (currentBytes + bytes > MAX_SECTION_TEXT_BYTES && current.length > 0) flush();
        current.push(chunk);
        currentBytes += bytes;
      }
    }

    flush();
  }

  if (result.length > MAX_IMPORT_SECTIONS) {
    throw new BookImportError(
      `El documento produciría más de ${MAX_IMPORT_SECTIONS} secciones. Divide el archivo en partes más pequeñas e inténtalo de nuevo.`,
    );
  }

  return result;
}

function filenameTitle(fileName: string): string {
  const base =
    fileName
      .split(/[\\/]/u)
      .at(-1)
      ?.replace(/\.[^.]+$/u, "") ?? "";
  return normalizeText(base.replace(/[._-]+/gu, " ")) || "Libro importado";
}

function validateSections(sections: ImportedSection[]): ImportedSection[] {
  const clean = splitOversizedSections(
    sections
      .map((section, index) => ({
        title: normalizeText(section.title) || `Capítulo ${index + 1}`,
        paragraphs: section.paragraphs.map(normalizeText).filter(Boolean),
      }))
      .filter((section) => section.paragraphs.length > 0),
  );

  if (clean.length === 0) {
    throw new BookImportError(
      "No encontré texto legible en el archivo. Si es un PDF escaneado, conviértelo primero mediante OCR o importa una versión con texto seleccionable.",
    );
  }

  if (clean.length > MAX_IMPORT_SECTIONS) {
    throw new BookImportError(
      `El libro supera el máximo de ${MAX_IMPORT_SECTIONS} secciones importables.`,
    );
  }

  const textBytes = clean.reduce(
    (sum, section) => sum + Buffer.byteLength(section.paragraphs.join("\n"), "utf8"),
    0,
  );
  if (textBytes > MAX_IMPORT_TEXT_BYTES) {
    throw new BookImportError("El texto extraído supera el límite seguro de 8 MB.");
  }

  return clean;
}

function matchingZipEntries(format: ImportFormat, name: string): boolean {
  const normalized = name.replace(/\\/gu, "/");
  if (format === "docx") {
    return ["word/document.xml", "word/styles.xml", "docProps/core.xml"].includes(normalized);
  }
  return normalized === "META-INF/container.xml" || /\.(?:opf|xhtml|html?|xml)$/iu.test(normalized);
}

async function readZipTextEntries(
  data: Uint8Array,
  format: ImportFormat,
): Promise<Map<string, Buffer>> {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(Buffer.from(data), {
      autoClose: false,
      lazyEntries: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });
  } catch {
    throw new BookImportError("El archivo comprimido está dañado o no tiene un formato válido.");
  }

  const extracted = new Map<string, Buffer>();
  let entryCount = 0;
  let totalBytes = 0;

  try {
    for await (const entry of zip.eachEntry()) {
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES) {
        throw new BookImportError("El archivo contiene demasiados elementos internos.");
      }

      if (entry.fileName.endsWith("/") || !matchingZipEntries(format, entry.fileName)) continue;
      if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
        throw new BookImportError(
          "Un componente interno del archivo supera el límite de tamaño permitido.",
        );
      }

      totalBytes += entry.uncompressedSize;
      if (totalBytes > MAX_ZIP_TEXT_BYTES) {
        throw new BookImportError("El contenido descomprimido supera el límite seguro de 24 MB.");
      }

      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let actualBytes = 0;
      for await (const chunk of stream) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        actualBytes += part.byteLength;
        if (actualBytes > MAX_ZIP_ENTRY_BYTES) {
          stream.destroy();
          throw new BookImportError(
            "Un componente interno del archivo supera el límite de tamaño permitido.",
          );
        }
        chunks.push(part);
      }
      extracted.set(entry.fileName.replace(/\\/gu, "/"), Buffer.concat(chunks));
    }
  } catch (error) {
    if (error instanceof BookImportError) throw error;
    throw new BookImportError("No se pudo leer el contenido comprimido del archivo.");
  } finally {
    zip.close();
  }

  return extracted;
}

function xmlString(entries: Map<string, Buffer>, fileName: string): string | undefined {
  const entry = entries.get(fileName);
  return entry?.toString("utf8");
}

function deepFirst(value: unknown, name: string): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFirst(item, name);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;

  for (const [key, nested] of Object.entries(value)) {
    if (!key.startsWith("@_") && localName(key) === name.toLowerCase()) return nested;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (!key.startsWith("@_")) {
      const found = deepFirst(nested, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function directChildren(value: unknown, name: string): unknown[] {
  return list(child(value, name));
}

function htmlBlocks(html: string): TextBlock[] {
  const root = parseHtml(html, { lowerCaseTagName: true, comment: false });
  const blocks: TextBlock[] = [];

  const visit = (node: HtmlNode) => {
    if (node.nodeType === NodeType.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tag = element.tagName?.toLowerCase();
      if (tag && HTML_SKIP_TAGS.has(tag)) return;

      if (tag && HTML_BLOCK_TAGS.has(tag)) {
        const text = normalizeText(element.textContent);
        if (text) blocks.push({ text, heading: /^h1$/u.test(tag) });
        return;
      }
    }

    for (const nested of node.childNodes) visit(nested);
  };

  visit(root);
  if (blocks.length === 0) {
    const text = normalizeText(root.textContent);
    if (text) blocks.push({ text });
  }
  return blocks;
}

async function parseEpub(fileName: string, data: Uint8Array): Promise<ParsedBookImport> {
  const entries = await readZipTextEntries(data, "epub");
  const containerXml = xmlString(entries, "META-INF/container.xml");
  if (!containerXml) throw new BookImportError("El EPUB no incluye su archivo de estructura.");

  const container = parseXml(containerXml);
  const rootfile = deepFirst(container, "rootfile");
  const packagePathRaw = attribute(rootfile, "full-path");
  if (!packagePathRaw) throw new BookImportError("No se encontró el catálogo interno del EPUB.");
  const packagePath = posix.normalize(packagePathRaw.replace(/\\/gu, "/"));
  const packageXml = xmlString(entries, packagePath);
  if (!packageXml) throw new BookImportError("No se pudo leer el catálogo interno del EPUB.");

  const packageDocument = parseXml(packageXml);
  const packageElement = deepFirst(packageDocument, "package") ?? packageDocument;
  const metadata = child(packageElement, "metadata");
  const manifest = child(packageElement, "manifest");
  const spine = child(packageElement, "spine");
  const manifestItems = directChildren(manifest, "item");
  const byId = new Map<string, { href: string; properties: string; title: string }>();

  for (const item of manifestItems) {
    const id = attribute(item, "id");
    const href = attribute(item, "href");
    if (!id || !href || /^\w+:/u.test(href)) continue;
    byId.set(id, {
      href,
      properties: attribute(item, "properties") ?? "",
      title: attribute(item, "title") ?? "",
    });
  }

  const baseDirectory = posix.dirname(packagePath);
  const sections: ImportedSection[] = [];
  for (const itemRef of directChildren(spine, "itemref")) {
    if ((attribute(itemRef, "linear") ?? "yes").toLowerCase() === "no") continue;
    const resource = byId.get(attribute(itemRef, "idref") ?? "");
    if (!resource || /\bnav\b/u.test(resource.properties)) continue;

    let href: string;
    try {
      href = decodeURIComponent(resource.href.split(/[?#]/u, 1)[0] ?? resource.href);
    } catch {
      continue;
    }
    const resourcePath = posix.normalize(posix.join(baseDirectory, href));
    if (resourcePath === ".." || resourcePath.startsWith("../") || resourcePath.startsWith("/"))
      continue;
    const html = xmlString(entries, resourcePath);
    if (!html) continue;

    const blocks = htmlBlocks(html);
    const firstHeading = blocks.find((block) => block.heading)?.text;
    const itemSections = splitBlocksIntoSections(
      blocks,
      firstHeading ?? `Capítulo ${sections.length + 1}`,
    );
    if (itemSections.length === 1 && !firstHeading && resource.title) {
      itemSections[0]!.title = normalizeText(resource.title).slice(0, 300);
    }
    sections.push(...itemSections);
  }

  const title = normalizeText(textValue(child(metadata, "title")));
  const authorName = normalizeText(textValue(child(metadata, "creator")));
  const language = normalizeText(textValue(child(metadata, "language")));

  return {
    format: "epub",
    title: title || filenameTitle(fileName),
    ...(authorName ? { authorName } : {}),
    ...(language ? { language } : {}),
    sections: validateSections(sections),
  };
}

function wordParagraphs(documentXml: string, stylesXml?: string): TextBlock[] {
  const document = parseXml(documentXml);
  const body = deepFirst(document, "body");
  if (!body) throw new BookImportError("El DOCX no contiene un manuscrito válido.");

  const headingStyles = new Set<string>();
  if (stylesXml) {
    const stylesDocument = parseXml(stylesXml);
    const styles = deepFirst(stylesDocument, "styles");
    for (const style of directChildren(styles, "style")) {
      const styleId = attribute(style, "styleId");
      const styleName =
        attribute(child(style, "name"), "val") ??
        normalizeText(textValue(child(child(style, "name"), "val")));
      const outlineLevel = attribute(child(child(style, "pPr"), "outlineLvl"), "val");
      if (
        styleId &&
        (/^heading\s*1$/iu.test(styleId) ||
          /^heading\s*1$/iu.test(styleName) ||
          outlineLevel === "0")
      ) {
        headingStyles.add(styleId);
      }
    }
  }

  const extractRunText = (value: unknown): string => {
    if (Array.isArray(value)) return value.map(extractRunText).join("");
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (value === null || typeof value !== "object") return "";

    return Object.entries(value)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([key, nested]) => {
        const tag = localName(key);
        if (tag === "t" || tag === "deltext" || tag === "instrtext") return textValue(nested);
        if (tag === "tab") return "\t";
        if (tag === "br" || tag === "cr") return "\n";
        return extractRunText(nested);
      })
      .join("");
  };

  return directChildren(body, "p")
    .map((paragraph) => {
      const text = normalizeText(extractRunText(paragraph));
      const paragraphStyle = child(child(paragraph, "pPr"), "pStyle");
      const styleId = attribute(paragraphStyle, "val") ?? "";
      const levelOne =
        headingStyles.has(styleId) ||
        /^heading\s*1$/iu.test(styleId) ||
        /^t[ií]tulo\s*1$/iu.test(styleId);
      return { text, heading: levelOne };
    })
    .filter((block) => block.text.length > 0);
}

async function parseDocx(fileName: string, data: Uint8Array): Promise<ParsedBookImport> {
  const entries = await readZipTextEntries(data, "docx");
  const documentXml = xmlString(entries, "word/document.xml");
  if (!documentXml) throw new BookImportError("El DOCX no contiene el documento principal.");
  const stylesXml = xmlString(entries, "word/styles.xml");
  const coreXml = xmlString(entries, "docProps/core.xml");

  const blocks = wordParagraphs(documentXml, stylesXml);
  const rawSections = splitBlocksIntoSections(blocks, "Manuscrito");
  const properties = coreXml ? parseXml(coreXml) : undefined;
  const title = normalizeText(textValue(deepFirst(properties, "title")));
  const authorName = normalizeText(textValue(deepFirst(properties, "creator")));

  return {
    format: "docx",
    title: title || filenameTitle(fileName),
    ...(authorName ? { authorName } : {}),
    sections: validateSections(rawSections),
  };
}

async function parsePdf(fileName: string, data: Uint8Array): Promise<ParsedBookImport> {
  let loadingTask: { promise: Promise<unknown>; destroy: () => Promise<void> } | undefined;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
    });
    const pdf = (await loadingTask.promise) as {
      numPages: number;
      getPage: (number: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
      }>;
      getMetadata: () => Promise<{ info?: { Title?: string; Author?: string } }>;
    };

    if (pdf.numPages > 2_000) {
      throw new BookImportError("El PDF supera el límite de 2.000 páginas.");
    }

    const blocks: TextBlock[] = [];
    let textBytes = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        line += item.str;
        if (item.hasEOL) {
          const text = normalizeText(line);
          if (text) blocks.push({ text });
          textBytes += Buffer.byteLength(line, "utf8");
          line = "";
        } else {
          line += " ";
        }
      }
      const remaining = normalizeText(line);
      if (remaining) {
        blocks.push({ text: remaining });
        textBytes += Buffer.byteLength(remaining, "utf8");
      }
      if (textBytes > MAX_IMPORT_TEXT_BYTES) {
        throw new BookImportError("El texto extraído del PDF supera el límite seguro de 8 MB.");
      }
    }

    const metadata = await pdf
      .getMetadata()
      .catch((): { info?: { Title?: string; Author?: string } } => ({}));
    const info = metadata.info ?? {};
    const sections = splitBlocksIntoSections(blocks, "Manuscrito");

    return {
      format: "pdf",
      title: normalizeText(info.Title ?? "") || filenameTitle(fileName),
      ...(normalizeText(info.Author ?? "") ? { authorName: normalizeText(info.Author ?? "") } : {}),
      sections: validateSections(sections),
    };
  } catch (error) {
    if (error instanceof BookImportError) throw error;
    throw new BookImportError(
      "No se pudo leer el PDF. Comprueba que no esté dañado y que permita extraer texto.",
    );
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

export async function parseBookImport(
  fileName: string,
  data: Uint8Array,
): Promise<ParsedBookImport> {
  if (data.byteLength === 0) throw new BookImportError("El archivo está vacío.");
  if (data.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new BookImportError("El archivo no puede superar los 15 MB.");
  }

  const extension = fileName.split(".").at(-1)?.toLowerCase();
  if (extension !== "epub" && extension !== "docx" && extension !== "pdf") {
    throw new BookImportError("Formato no admitido. Selecciona un archivo EPUB, DOCX o PDF.");
  }

  if (extension === "pdf") {
    if (Buffer.from(data.subarray(0, 5)).toString("ascii") !== "%PDF-") {
      throw new BookImportError("El archivo no parece ser un PDF válido.");
    }
    return parsePdf(fileName, data);
  }

  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new BookImportError("El archivo comprimido no parece ser un EPUB o DOCX válido.");
  }

  return extension === "epub" ? parseEpub(fileName, data) : parseDocx(fileName, data);
}
