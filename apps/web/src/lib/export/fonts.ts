import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  measureTrueTypeTextPoints,
  parseTrueTypeFont,
  type PdfFont,
  type PdfFontFamily,
  type PdfFontProgram,
  type TrueTypeFont,
} from "@escribiendo/export-engine";
import type { MeasureText } from "@escribiendo/editorial-engine";

/**
 * Carga las fuentes TrueType que se incrustan en el PDF.
 *
 * Los archivos viven en `public/fonts/liberation` para que también estén
 * disponibles si se sirve la aplicación desde otro directorio de trabajo. Si
 * falta algún archivo, la exportación sigue con Times/WinAnsi y lo declara en
 * sus metadatos; no se inventan métricas.
 */

const FILES: Record<PdfFontFamily, Record<PdfFont, string>> = {
  serif: {
    regular: "LiberationSerif-Regular.ttf",
    bold: "LiberationSerif-Bold.ttf",
    italic: "LiberationSerif-Italic.ttf",
    boldItalic: "LiberationSerif-BoldItalic.ttf",
  },
  "sans-serif": {
    regular: "LiberationSans-Regular.ttf",
    bold: "LiberationSans-Bold.ttf",
    italic: "LiberationSans-Italic.ttf",
    boldItalic: "LiberationSans-BoldItalic.ttf",
  },
  monospace: {
    regular: "LiberationMono-Regular.ttf",
    bold: "LiberationMono-Bold.ttf",
    italic: "LiberationMono-Italic.ttf",
    boldItalic: "LiberationMono-BoldItalic.ttf",
  },
};

export interface PdfFontSet {
  programs: PdfFontProgram[];
  /** Medición real en puntos para la paginación y la colocación del PDF. */
  measure: MeasureText;
}

const FAMILIES: PdfFontFamily[] = ["serif", "sans-serif", "monospace"];
const STYLES: PdfFont[] = ["regular", "bold", "italic", "boldItalic"];

let cache: Promise<PdfFontSet | null> | null = null;

function candidateDirectories(): string[] {
  const cwd = process.cwd();

  return [
    path.join(cwd, "public", "fonts", "liberation"),
    path.join(cwd, "apps", "web", "public", "fonts", "liberation"),
    path.join(cwd, "..", "public", "fonts", "liberation"),
  ];
}

async function resolveDirectory(): Promise<string | null> {
  for (const directory of candidateDirectories()) {
    try {
      await readFile(path.join(/* turbopackIgnore: true */ directory, FILES.serif.regular));
      return directory;
    } catch {
      // Se prueba el siguiente candidato.
    }
  }

  return null;
}

async function loadPdfFontSet(): Promise<PdfFontSet | null> {
  const directory = await resolveDirectory();

  if (!directory) {
    return null;
  }

  const programs: PdfFontProgram[] = [];
  const faces = new Map<string, TrueTypeFont>();

  try {
    for (const family of FAMILIES) {
      for (const style of STYLES) {
        const file = FILES[family][style];
        const data = new Uint8Array(
          await readFile(path.join(/* turbopackIgnore: true */ directory, file)),
        );
        const name = file.replace(/\.ttf$/u, "");

        programs.push({ family, style, data, name });
        faces.set(`${family}:${style}`, parseTrueTypeFont(data, name));
      }
    }
  } catch {
    return null;
  }

  const measure: MeasureText = (text, options) => {
    // La cara se elige igual que en el PDF: la misma que se dibuja es la que
    // se mide, para que la paginación y el archivo coincidan.
    const style: PdfFont = options.bold
      ? options.italic
        ? "boldItalic"
        : "bold"
      : options.italic
        ? "italic"
        : "regular";
    const font =
      faces.get(`${options.fontFamily}:${style}`) ??
      faces.get(`serif:${style}`) ??
      faces.get("serif:regular");

    if (!font) {
      return 0;
    }

    const normalized = options.uppercase ? text.toLocaleUpperCase("es") : text;

    return measureTrueTypeTextPoints(
      font,
      normalized,
      options.fontSizePt,
      options.letterSpacingPt ?? 0,
    );
  };

  return { programs, measure };
}

/** Devuelve las fuentes una sola vez por proceso. */
export function loadPdfFonts(): Promise<PdfFontSet | null> {
  cache ??= loadPdfFontSet();

  return cache;
}
