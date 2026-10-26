import "server-only";
import type { TiptapDocument, TiptapNode, TiptapMark } from "@escribiendo/book-schema";
import { esEnlaceSeguro } from "@escribiendo/shared";
import { detectImportSections, type ImportTextBlock } from "./import-detection";
import type { ImportSectionType } from "./import-types";
import { wordImportBlocks } from "./import-word";
import { pdfImportBlocks, type PdfImportPage, type PdfImportItem } from "./import-pdf-layout";
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
  type?: ImportSectionType;
  simplified?: boolean;
  content?: TiptapDocument;
  detection?: { score: number; signals: string[]; confidence: "alta" | "media" | "baja" };
}

export interface ParsedBookImport {
  format: ImportFormat;
  title?: string;
  authorName?: string;
  language?: string;
  sections: ImportedSection[];
  warnings?: string[];
}

export class BookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookImportError";
  }
}

type TextBlock = ImportTextBlock;

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

function splitBlocksIntoSections(blocks: TextBlock[], defaultTitle: string): ImportedSection[] {
  return detectImportSections(blocks, defaultTitle);
}

export function splitOversizedSections(sections: ImportedSection[]): ImportedSection[] {
  const result: ImportedSection[] = [];
  const count = (node: TiptapNode): number =>
    1 + (node.content ?? []).reduce((sum, child) => sum + count(child), 0);
  const plain = (node: TiptapNode): string =>
    node.text ?? (node.type === "hardBreak" ? "\n" : (node.content ?? []).map(plain).join(""));
  for (const section of sections) {
    const source =
      section.content?.content ??
      section.paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }));
    let nodes: TiptapNode[] = [],
      paragraphs: string[] = [],
      bytes = 0,
      nodeCount = 0,
      part = 1,
      simplified = false;
    function flush() {
      if (!nodes.length) return;
      result.push({
        ...section,
        title: part === 1 ? section.title : `${section.title} (continuación ${part})`.slice(0, 300),
        paragraphs,
        content: { type: "doc", content: nodes },
        ...(simplified ? { simplified: true } : {}),
      });
      nodes = [];
      paragraphs = [];
      bytes = 0;
      nodeCount = 0;
      part++;
    }
    for (let index = 0; index < source.length; index++) {
      const original = source[index]!;
      // Los párrafos vacíos pueden omitirse del resumen, pero siguen presentes
      // en el documento. El índice del resumen nunca identifica al nodo fuente.
      const text = section.content
        ? plain(original)
        : (section.paragraphs[index] ?? plain(original));
      let chunks = [{ node: original, text }];
      if (
        Buffer.byteLength(JSON.stringify(original), "utf8") > MAX_SECTION_TEXT_BYTES ||
        count(original) > 15_000 ||
        text.length > 200_000
      ) {
        chunks = [];
        let remaining = text;
        while (remaining) {
          const buffer = Buffer.from(remaining, "utf8");
          let end = Math.min(100_000, buffer.length);
          while (end < buffer.length && end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end--;
          const chunk = buffer.subarray(0, end).toString("utf8");
          chunks.push({
            node: { type: "paragraph", content: [{ type: "text", text: chunk }] },
            text: chunk,
          });
          remaining = remaining.slice(chunk.length);
        }
        simplified = true;
      }
      for (const chunk of chunks) {
        const size = Buffer.byteLength(JSON.stringify(chunk.node), "utf8"),
          amount = count(chunk.node);
        if (nodes.length && (bytes + size > MAX_SECTION_TEXT_BYTES || nodeCount + amount > 15_000))
          flush();
        nodes.push(chunk.node);
        if (chunk.text) paragraphs.push(chunk.text);
        bytes += size;
        nodeCount += amount;
      }
    }
    flush();
  }
  if (result.length > MAX_IMPORT_SECTIONS)
    throw new BookImportError(
      `El documento produciría más de ${MAX_IMPORT_SECTIONS} secciones. Divide el archivo en partes más pequeñas e inténtalo de nuevo.`,
    );
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
        ...section,
        title: normalizeText(section.title) || `Capítulo ${index + 1}`,
        paragraphs: section.paragraphs.map(normalizeText).filter(Boolean),
      }))
      .filter((section) => section.paragraphs.length > 0 || Boolean(section.content)),
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
    return [
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
      "word/footnotes.xml",
      "word/endnotes.xml",
      "docProps/core.xml",
    ].includes(normalized);
  }
  return (
    normalized === "META-INF/container.xml" || /\.(?:opf|xhtml|html?|xml|ncx)$/iu.test(normalized)
  );
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

function htmlBlocks(html: string, anchors: ReadonlyMap<string, string> = new Map()): TextBlock[] {
  const root = parseHtml(html, { lowerCaseTagName: true, comment: false });
  const blocks: TextBlock[] = [];
  function inline(node: HtmlNode, marks: TiptapMark[] = []): TiptapNode[] {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = node.textContent.replace(/\u00a0/gu, " ");
      return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
    }
    const element = node as HTMLElement;
    const tag = element.tagName?.toLowerCase();
    if (tag && HTML_SKIP_TAGS.has(tag)) return [];
    if (tag === "br") return [{ type: "hardBreak" }];
    const type = tag
      ? (
          {
            b: "bold",
            strong: "bold",
            i: "italic",
            em: "italic",
            u: "underline",
            s: "strike",
            del: "strike",
          } as Record<string, string>
        )[tag]
      : undefined;
    const next = type ? [...marks, { type }] : [...marks];
    if (tag === "a") {
      const href = element.getAttribute("href");
      if (href && esEnlaceSeguro(href)) next.push({ type: "link", attrs: { href } });
    }
    return node.childNodes.flatMap((child) => inline(child, next));
  }
  const semanticTypes: Record<string, ImportSectionType> = {
    prologue: "PROLOGUE",
    epilogue: "EPILOGUE",
    dedication: "DEDICATION",
    preface: "FOREWORD",
    acknowledgments: "ACKNOWLEDGMENTS",
    copyright: "COPYRIGHT",
    toc: "TABLE_OF_CONTENTS",
    titlepage: "TITLE_PAGE",
    part: "PART",
    chapter: "CHAPTER",
  };
  function visit(node: HtmlNode) {
    if (node.nodeType === NodeType.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tag = element.tagName?.toLowerCase();
      if (tag && HTML_SKIP_TAGS.has(tag)) return;
      const anchor = anchors.get(element.id);
      const semantic = (element.getAttribute("epub:type") ?? "")
        .split(/\s+/u)
        .map((value) => semanticTypes[value])
        .find(Boolean);
      if (anchor && !/^h[1-6]$/u.test(tag ?? ""))
        blocks.push({
          text: anchor,
          heading: true,
          boundary: true,
          ...(semantic ? { sectionType: semantic } : {}),
        });
      if (tag && HTML_BLOCK_TAGS.has(tag)) {
        const content = inline(node);
        const text = normalizeText(
          content.map((n) => n.text ?? (n.type === "hardBreak" ? "\n" : "")).join(""),
        );
        if (text) {
          const level = /^h([1-6])$/u.exec(tag);
          blocks.push({
            text,
            ...(level ? { headingLevel: Number(level[1]) } : {}),
            ...(anchor ? { heading: true, boundary: true } : {}),
            ...(semantic ? { sectionType: semantic } : {}),
            node: {
              type: level ? "heading" : "paragraph",
              ...(level ? { attrs: { level: Math.min(3, Number(level[1])) } } : {}),
              content,
            },
          });
        }
        return;
      }
    }
    for (const nested of node.childNodes) visit(nested);
  }
  visit(root.querySelector("body") ?? root);
  if (!blocks.length) {
    const text = normalizeText(root.querySelector("body")?.textContent ?? root.textContent);
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
  const byId = new Map<
    string,
    { href: string; properties: string; title: string; mediaType: string }
  >();

  for (const item of manifestItems) {
    const id = attribute(item, "id");
    const href = attribute(item, "href");
    if (!id || !href || /^\w+:/u.test(href)) continue;
    byId.set(id, {
      href,
      mediaType: attribute(item, "media-type") ?? "",
      properties: attribute(item, "properties") ?? "",
      title: attribute(item, "title") ?? "",
    });
  }

  const baseDirectory = posix.dirname(packagePath);
  const navigationLabels = new Map<string, string>();
  const anchorLabels = new Map<string, Map<string, string>>();
  function registerLabel(base: string, href: string, label: string) {
    if (/^\w+:/u.test(href) || !label) return;
    try {
      const [file, fragment] = href.split("#");
      const path = posix.normalize(posix.join(posix.dirname(base), decodeURIComponent(file ?? "")));
      if (!navigationLabels.has(path)) navigationLabels.set(path, label);
      if (fragment) {
        const labels = anchorLabels.get(path) ?? new Map<string, string>();
        labels.set(decodeURIComponent(fragment), label);
        anchorLabels.set(path, labels);
      }
    } catch {
      return;
    }
  }
  for (const resource of byId.values()) {
    const path = posix.normalize(posix.join(baseDirectory, resource.href));
    const xml = xmlString(entries, path);
    if (!xml) continue;
    if (/\bnav\b/u.test(resource.properties))
      for (const link of parseHtml(xml).querySelectorAll("nav a[href]"))
        registerLabel(path, link.getAttribute("href") ?? "", normalizeText(link.textContent));
    if (resource.mediaType.includes("ncx") || /\.ncx$/iu.test(resource.href)) {
      // El DTD externo de NCX no se consulta. Las entidades internas siguen prohibidas.
      const ncx = parseXml(xml.replace(/<!DOCTYPE[^>\[]*>/giu, ""));
      const visit = (points: unknown[]) => {
        for (const point of points) {
          const label = normalizeText(textValue(child(child(point, "navlabel"), "text")));
          const href = attribute(child(point, "content"), "src");
          if (href) registerLabel(path, href, label);
          visit(directChildren(point, "navpoint"));
        }
      };
      visit(directChildren(deepFirst(ncx, "navmap"), "navpoint"));
    }
  }
  const warnings = [
    "Se conservan el texto, los encabezados y el formato básico. Las imágenes y el diseño de página del EPUB deben revisarse por separado.",
  ];
  const sections: ImportedSection[] = [];
  for (const itemRef of directChildren(spine, "itemref")) {
    const nonLinear = (attribute(itemRef, "linear") ?? "yes").toLowerCase() === "no";
    const resource = byId.get(attribute(itemRef, "idref") ?? "");
    if (!resource)
      throw new BookImportError("El orden de lectura del EPUB apunta a una sección que no existe.");
    if (/\bnav\b/u.test(resource.properties)) continue;
    if (nonLinear)
      warnings.push(
        "Se incluyó texto opcional no lineal del EPUB (por ejemplo, notas o anexos). Revisa si debe formar parte del libro.",
      );

    let href: string;
    try {
      href = decodeURIComponent(resource.href.split(/[?#]/u, 1)[0] ?? resource.href);
    } catch {
      throw new BookImportError("El EPUB contiene una referencia de capítulo no válida.");
    }
    const resourcePath = posix.normalize(posix.join(baseDirectory, href));
    if (resourcePath === ".." || resourcePath.startsWith("../") || resourcePath.startsWith("/"))
      throw new BookImportError("El EPUB contiene una ruta de capítulo no válida.");
    const html = xmlString(entries, resourcePath);
    if (!html) {
      if (resource.mediaType.startsWith("image/")) {
        warnings.push("Una página del EPUB contiene solo una imagen y no tiene texto extraíble.");
        continue;
      }
      throw new BookImportError(
        "Falta una página incluida en el orden de lectura del EPUB; no se importará un libro incompleto.",
      );
    }

    const blocks = htmlBlocks(html, anchorLabels.get(resourcePath));
    const metadataTitle = normalizeText(textValue(list(child(metadata, "title"))[0]));
    if (blocks[0]?.text === metadataTitle) blocks[0].sectionType = "TITLE_PAGE";
    const firstHeading = blocks.find((block) => block.heading || block.headingLevel)?.text;
    const itemSections = splitBlocksIntoSections(
      blocks,
      firstHeading ?? navigationLabels.get(resourcePath) ?? `Capítulo ${sections.length + 1}`,
    );
    if (itemSections.length === 1 && !firstHeading && resource.title) {
      itemSections[0]!.title = normalizeText(resource.title).slice(0, 300);
    }
    sections.push(...itemSections);
  }

  const title = normalizeText(textValue(list(child(metadata, "title"))[0]));
  const authorName = list(child(metadata, "creator"))
    .map((value) => normalizeText(textValue(value)))
    .filter(Boolean)
    .join(", ");
  const language = normalizeText(textValue(list(child(metadata, "language"))[0]));

  return {
    format: "epub",
    warnings: [...new Set(warnings)],
    title: title || filenameTitle(fileName),
    ...(authorName ? { authorName } : {}),
    ...(language ? { language } : {}),
    sections: validateSections(sections),
  };
}

async function parseDocx(fileName: string, data: Uint8Array): Promise<ParsedBookImport> {
  const entries = await readZipTextEntries(data, "docx");
  const documentXml = xmlString(entries, "word/document.xml");
  if (!documentXml) throw new BookImportError("El DOCX no contiene el documento principal.");
  const stylesXml = xmlString(entries, "word/styles.xml");
  const coreXml = xmlString(entries, "docProps/core.xml");

  const relationsXml = xmlString(entries, "word/_rels/document.xml.rels");
  const notesXml = xmlString(entries, "word/footnotes.xml");
  const endnotesXml = xmlString(entries, "word/endnotes.xml");
  for (const xml of [documentXml, stylesXml, relationsXml, notesXml, endnotesXml])
    if (xml) parseXml(xml);
  const blocks = wordImportBlocks(documentXml, stylesXml, relationsXml, notesXml, endnotesXml);
  const rawSections = splitBlocksIntoSections(blocks, "Manuscrito");
  const properties = coreXml ? parseXml(coreXml) : undefined;
  const title = normalizeText(textValue(deepFirst(properties, "title")));
  const authorName = normalizeText(textValue(deepFirst(properties, "creator")));

  return {
    format: "docx",
    warnings: [
      "Se conserva el texto y el formato básico. Las tablas se convierten en párrafos en orden de lectura; las imágenes y la maquetación de Word no se trasladan.",
      ...(/w:(drawing|pict)/u.test(documentXml)
        ? ["El documento contiene imágenes; revisa y añádelas después de importar."]
        : []),
      ...(/w:endnoteReference/u.test(documentXml)
        ? [
            "Las notas finales se integran como notas al pie editables; las notas de más de 2000 caracteres se conservan como texto.",
          ]
        : []),
    ],
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
      useWorkerFetch: false,
      data: new Uint8Array(data),
      useSystemFonts: true,
    });
    const pdf = (await loadingTask.promise) as {
      numPages: number;
      getPage: (number: number) => Promise<{
        getTextContent: () => Promise<{ items: PdfImportItem[] }>;
        getViewport: (options: { scale: number }) => { height: number };
      }>;
      getMetadata: () => Promise<{ info?: { Title?: string; Author?: string } }>;
    };

    if (pdf.numPages > 2_000) {
      throw new BookImportError("El PDF supera el límite de 2.000 páginas.");
    }

    const pages: PdfImportPage[] = [];
    let textBytes = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) textBytes += Buffer.byteLength(item.str ?? "", "utf8");
      if (textBytes > MAX_IMPORT_TEXT_BYTES)
        throw new BookImportError("El texto extraído del PDF supera el límite seguro de 8 MB.");
      pages.push({ height: page.getViewport({ scale: 1 }).height, items: content.items });
    }
    const { blocks, removed } = pdfImportBlocks(pages);

    const metadata = await pdf
      .getMetadata()
      .catch((): { info?: { Title?: string; Author?: string } } => ({}));
    const info = metadata.info ?? {};
    const sections = splitBlocksIntoSections(blocks, "Manuscrito");

    return {
      format: "pdf",
      warnings: [
        "El PDF no almacena la estructura original del manuscrito. Revisa la separación de capítulos y párrafos; columnas, imágenes y notas pueden requerir corrección manual.",
        ...(removed
          ? [`Se omitieron ${removed} líneas repetidas de encabezados o folios en los márgenes.`]
          : []),
      ],
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
    const parsed = await parsePdf(fileName, data);
    return finalizeImport(parsed);
  }

  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new BookImportError("El archivo comprimido no parece ser un EPUB o DOCX válido.");
  }

  return finalizeImport(
    await (extension === "epub" ? parseEpub(fileName, data) : parseDocx(fileName, data)),
  );
}

function finalizeImport(parsed: ParsedBookImport): ParsedBookImport {
  return {
    ...parsed,
    warnings: [
      ...(parsed.warnings ?? []),
      ...(parsed.sections.some((section) => section.simplified)
        ? [
            "Un bloque excepcionalmente grande se dividió en texto simple para conservar su contenido dentro de los límites del editor.",
          ]
        : []),
    ],
  };
}
