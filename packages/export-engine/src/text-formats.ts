import type {
  ExportBlock,
  ExportChapter,
  ExportDocumentModel,
  ExportFootnote,
  ExportInlineRun,
} from "./epub";
import { esEnlaceSeguro } from "./xml";

/**
 * Formatos de texto plano y ligero: Markdown, HTML y texto.
 *
 * Comparten el mismo `ExportDocumentModel` que el EPUB y el DOCX, de modo que
 * un capítulo no puede decir una cosa en el EPUB y otra en el Markdown. No
 * incrustan imágenes binarias: en Markdown y HTML se conserva la referencia
 * (y el texto alternativo), y en texto se escribe el texto alternativo. Es el
 * mismo criterio que sigue el exportador de referencia del que procede esta
 * función: un archivo de texto no debe convertirse en un contenedor.
 */

const NEWLINE = "\n";

const encoder = new TextEncoder();

function encode(text: string): Uint8Array {
  return encoder.encode(text.endsWith(NEWLINE) ? text : `${text}${NEWLINE}`);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/gu, NEWLINE);
}

/** Texto de un tramo sin ningún formato, para el formato de texto plano. */
function plainRun(run: ExportInlineRun): string {
  return run.footnote ? `[${run.footnote.number}]` : run.text;
}

/** Texto de un bloque sin formato, respetando los saltos internos. */
function plainBlockText(block: ExportBlock): string {
  if (block.runs && block.runs.length > 0) {
    return block.runs.map(plainRun).join("");
  }
  return block.text;
}

function escapeHtml(text: string): string {
  return normalizeNewlines(text)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/** Escapa solo lo que Markdown interpretaría como estructura. */
function escapeMarkdown(text: string): string {
  return normalizeNewlines(text).replace(/([\\`*_[\]<>])/gu, "\$1");
}

function markdownInline(run: ExportInlineRun): string {
  if (run.footnote) {
    return `[^${run.footnote.number}]`;
  }

  let text = escapeMarkdown(run.text);

  if (run.subscript) text = `<sub>${text}</sub>`;
  else if (run.superscript) text = `<sup>${text}</sup>`;

  if (run.strike) text = `~~${text}~~`;
  if (run.underline) text = `<u>${text}</u>`;
  if (run.italic) text = `*${text}*`;
  if (run.bold) text = `**${text}**`;
  if (run.link && esEnlaceSeguro(run.link)) {
    text = `[${text}](${run.link.replace(/\)/gu, "%29")})`;
  }

  return text;
}

function markdownBlock(block: ExportBlock): string {
  const text =
    block.runs && block.runs.length > 0
      ? block.runs.map(markdownInline).join("")
      : escapeMarkdown(block.text);

  switch (block.kind) {
    case "title":
      return `# ${text}`;
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(2, (block.level ?? 2) + 1)))} ${text}`;
    case "quote":
      return text
        .split(NEWLINE)
        .map((line) => `> ${line}`)
        .join(NEWLINE);
    case "rule":
      return "* * *";
    case "pageBreak":
      return "";
    case "image":
      return block.image?.src
        ? `![${escapeMarkdown(block.image.alt ?? "")}](${block.image.src})`
        : `[Imagen: ${escapeMarkdown(block.image?.alt ?? "sin texto alternativo")}]`;
    default:
      return text;
  }
}

function footnotesOf(chapter: ExportChapter): ExportFootnote[] {
  const notes: ExportFootnote[] = [];
  const seen = new Set<string>();

  for (const block of chapter.blocks) {
    for (const run of block.runs ?? []) {
      if (run.footnote && !seen.has(run.footnote.id)) {
        seen.add(run.footnote.id);
        notes.push(run.footnote);
      }
    }
  }

  return notes;
}

function tocLines(document: ExportDocumentModel): string[] {
  const entries = document.toc?.entries;
  if (entries && entries.length > 0) {
    return entries.map((entry) => `${"  ".repeat(Math.max(0, entry.level - 1))}- ${entry.title}`);
  }

  return document.chapters
    .filter((chapter) => chapter.showInToc !== false)
    .map((chapter) => `- ${chapter.title}`);
}

/** Markdown del libro completo, con notas al pie y referencias de imagen. */
export function buildMarkdown(document: ExportDocumentModel): Uint8Array {
  const lines: string[] = [`# ${escapeMarkdown(document.title)}`, ""];

  if (document.author.trim()) {
    lines.push(`*${escapeMarkdown(document.author)}*`, "");
  }

  const toc = tocLines(document);
  if (toc.length > 0) {
    lines.push(`## ${escapeMarkdown(document.toc?.title ?? "Índice")}`, "", ...toc, "");
  }

  for (const chapter of document.chapters) {
    if (chapter.showTitle !== false) {
      lines.push(`## ${escapeMarkdown(chapter.title)}`, "");
    }

    for (const block of chapter.blocks) {
      const rendered = markdownBlock(block);
      if (rendered) lines.push(rendered, "");
    }

    const notes = footnotesOf(chapter);
    if (notes.length > 0) {
      for (const note of notes) {
        lines.push(`[^${note.number}]: ${escapeMarkdown(note.note)}`);
      }
      lines.push("");
    }
  }

  return encode(
    lines
      .join(NEWLINE)
      .replace(/\n{3,}/gu, `${NEWLINE}${NEWLINE}`)
      .trimEnd(),
  );
}

function htmlInline(run: ExportInlineRun): string {
  if (run.footnote) {
    return (
      `<a class="footnote-ref" href="#fn-${escapeHtml(run.footnote.id)}" ` +
      `id="fnref-${escapeHtml(run.footnote.id)}"><sup>${run.footnote.number}</sup></a>`
    );
  }

  let html = escapeHtml(run.text);

  if (run.subscript) html = `<sub>${html}</sub>`;
  else if (run.superscript) html = `<sup>${html}</sup>`;

  if (run.strike) html = `<s>${html}</s>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  if (run.link && esEnlaceSeguro(run.link)) {
    html = `<a href="${escapeHtml(run.link)}">${html}</a>`;
  }

  return html;
}

function htmlBlock(block: ExportBlock): string {
  const inner =
    block.runs && block.runs.length > 0
      ? block.runs.map(htmlInline).join("")
      : escapeHtml(block.text);

  switch (block.kind) {
    case "title":
      return `<h1>${inner}</h1>`;
    case "heading": {
      const level = Math.min(6, Math.max(2, (block.level ?? 2) + 1));
      return `<h${level}>${inner}</h${level}>`;
    }
    case "quote":
      return `<blockquote>${inner}</blockquote>`;
    case "rule":
      return '<hr class="scene" />';
    case "pageBreak":
      return '<div class="pagebreak"></div>';
    case "image":
      return block.image?.src
        ? `<figure class="image"><img src="${escapeHtml(block.image.src)}" ` +
            `alt="${escapeHtml(block.image.alt ?? "")}" loading="lazy" />` +
            (block.image.alt ? `<figcaption>${escapeHtml(block.image.alt)}</figcaption>` : "") +
            "</figure>"
        : `<p class="image-alt">${escapeHtml(block.image?.alt ?? "Imagen sin texto alternativo")}</p>`;
    default:
      return `<p>${inner}</p>`;
  }
}

const HTML_STYLES = `:root { color-scheme: light dark; }
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.55; margin: 0 auto; max-width: 42rem; padding: 2rem 1.25rem; }
h1, h2, h3 { line-height: 1.2; }
blockquote { margin: 1em 1.5em; font-style: italic; }
hr.scene { border: 0; text-align: center; }
hr.scene::after { content: "* * *"; letter-spacing: 0.4em; }
figure.image { margin: 1.5em auto; text-align: center; }
figure.image img { max-width: 100%; height: auto; }
figcaption, .image-alt { font-size: 0.9em; font-style: italic; color: #555; }
nav.toc ol { list-style: none; padding-left: 1rem; }
section.footnotes { margin-top: 3em; font-size: 0.85em; border-top: 1px solid #999; padding-top: 1em; }
a.footnote-ref { text-decoration: none; }`;

/** Documento HTML5 autónomo: se puede abrir en cualquier navegador sin recursos externos. */
export function buildHtml(document: ExportDocumentModel): Uint8Array {
  const lang = escapeHtml(document.language || "es");
  const parts: string[] = [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(document.title)}</title>`,
    document.author.trim() ? `<meta name="author" content="${escapeHtml(document.author)}" />` : "",
    `<style>${HTML_STYLES}</style>`,
    "</head>",
    "<body>",
    `<header><h1>${escapeHtml(document.title)}</h1>` +
      (document.author.trim() ? `<p><em>${escapeHtml(document.author)}</em></p>` : "") +
      "</header>",
  ];

  const toc = tocLines(document);
  if (toc.length > 0) {
    parts.push(
      `<nav class="toc" aria-label="${escapeHtml(document.toc?.title ?? "Índice")}">`,
      `<h2>${escapeHtml(document.toc?.title ?? "Índice")}</h2>`,
      "<ol>",
      ...toc.map((line) => `<li>${escapeHtml(line.replace(/^[\s-]+/u, ""))}</li>`),
      "</ol>",
      "</nav>",
    );
  }

  for (const chapter of document.chapters) {
    parts.push(`<section id="${escapeHtml(chapter.id)}">`);
    if (chapter.showTitle !== false) {
      parts.push(`<h2>${escapeHtml(chapter.title)}</h2>`);
    }
    for (const block of chapter.blocks) {
      parts.push(htmlBlock(block));
    }

    const notes = footnotesOf(chapter);
    if (notes.length > 0) {
      parts.push('<section class="footnotes">', "<ol>");
      for (const note of notes) {
        parts.push(
          `<li id="fn-${escapeHtml(note.id)}">${escapeHtml(note.note)} ` +
            `<a class="footnote-back" href="#fnref-${escapeHtml(note.id)}">↩</a></li>`,
        );
      }
      parts.push("</ol>", "</section>");
    }

    parts.push("</section>");
  }

  parts.push("</body>", "</html>");

  return encode(parts.filter((part) => part !== "").join(NEWLINE));
}

/** Texto plano: títulos, párrafos y separadores; sin marcado. */
export function buildPlainText(document: ExportDocumentModel): Uint8Array {
  const header = [document.title, document.author.trim() ? document.author : ""]
    .filter(Boolean)
    .join(NEWLINE);
  const blocks: string[] = header ? [header] : [];

  for (const chapter of document.chapters) {
    if (chapter.showTitle !== false) {
      blocks.push(
        `${chapter.title}${NEWLINE}${"=".repeat(Math.min(60, Math.max(3, chapter.title.length)))}`,
      );
    }

    for (const block of chapter.blocks) {
      if (block.kind === "rule") {
        blocks.push("* * *");
        continue;
      }

      if (block.kind === "image") {
        blocks.push(`[Imagen: ${block.image?.alt ?? "sin texto alternativo"}]`);
        continue;
      }

      const text = plainBlockText(block).trim();
      if (!text) continue;

      if (block.kind === "quote") {
        blocks.push(
          text
            .split(NEWLINE)
            .map((line) => `    ${line}`)
            .join(NEWLINE),
        );
      } else {
        blocks.push(text);
      }
    }

    const notes = footnotesOf(chapter);
    if (notes.length > 0) {
      blocks.push(notes.map((note) => `[${note.number}] ${note.note}`).join(NEWLINE));
    }
  }

  return encode(
    blocks
      .join(`${NEWLINE}${NEWLINE}`)
      .replace(/\n{3,}/gu, `${NEWLINE}${NEWLINE}`)
      .trimEnd(),
  );
}
