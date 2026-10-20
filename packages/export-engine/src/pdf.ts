/**
 * Escritor de PDF mínimo.
 *
 * Genera un PDF 1.4 con las fuentes estándar (Times-Roman, Times-Bold y
 * Times-Italic), que no hay que incrustar: el lector ya las tiene. Es
 * suficiente para un PDF de lectura y para un PDF de imprenta con marcas de
 * corte y sangrado.
 *
 * El texto se compone a partir de las líneas que ya decidió el motor de
 * paginación, de modo que el PDF y la vista previa coinciden.
 */

/** Milímetros a puntos (1 pulgada = 72 puntos). */
export const MM_TO_POINTS = 72 / 25.4;

export type PdfFont = "regular" | "bold" | "italic";

export interface PdfRun {
  text: string;
  font: PdfFont;
  sizePt: number;
  /** Distancia horizontal desde el borde izquierdo, en milímetros. */
  xMm: number;
  /** Distancia vertical de la línea base desde el borde superior, en milímetros. */
  baselineMm: number;
  /**
   * Espacio extra entre palabras, en puntos.
   *
   * Es lo que hace el justificado: el ancho que sobra se reparte entre los
   * espacios de la línea.
   */
  wordSpacing?: number;
}

export interface PdfPage {
  /** Tamaño de la hoja acabada, en milímetros. */
  widthMm: number;
  heightMm: number;
  runs: PdfRun[];
  /** Sangrado que se añade a la hoja para la impresión. */
  bleedMm?: number;
  /** Marcas de corte y de registro. */
  cropMarks?: boolean;
}

export interface PdfDocument {
  title: string;
  author: string;
  subject?: string;
  /** Fecha de creación. Se fija para que el resultado sea reproducible. */
  createdAt: Date;
  pages: PdfPage[];
  /** Idioma del documento, por ejemplo `es`. */
  language?: string;
}

const FONTS: Record<PdfFont, string> = {
  regular: "Times-Roman",
  bold: "Times-Bold",
  italic: "Times-Italic",
};

const FONT_KEYS: PdfFont[] = ["regular", "bold", "italic"];

/** Escapado de texto para una cadena literal de PDF. */
function escapePdfText(text: string): string {
  let result = "";

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;

    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      result += `\\${character}`;
      continue;
    }

    if (code < 32) {
      result += " ";
      continue;
    }

    if (code < 256) {
      result += character;
      continue;
    }

    // WinAnsiEncoding no llega más allá de Latin-1: el resto se sustituye.
    result += "?";
  }

  return result;
}

/** Fecha en el formato `D:YYYYMMDDHHmmSSZ` que espera el diccionario de información. */
function pdfDate(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

  return [
    "D:",
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

/** Longitud de las marcas de corte, en milímetros. */
const CROP_MARK_LENGTH_MM = 5;
/** Distancia entre la marca y el borde de la hoja acabada. */
const CROP_MARK_GAP_MM = 2;

/**
 * Construye el PDF.
 */
export function buildPdf(document: PdfDocument): Uint8Array {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];

  // 1 catálogo, 2 páginas, 3-5 fuentes, 6 información.
  const catalogNumber = 1;
  const pagesNumber = 2;
  const infoNumber = 6;
  let nextNumber = 7;

  const fontNumbers = new Map<PdfFont, number>();

  for (const font of FONT_KEYS) {
    fontNumbers.set(font, nextNumber);
    nextNumber += 1;
  }

  for (const _page of document.pages) {
    const pageNumber = nextNumber;
    const contentNumber = nextNumber + 1;
    nextNumber += 2;

    pageObjectNumbers.push(pageNumber);
    objects[pageNumber] = ""; // marcador de posición
    objects[contentNumber] = "";
  }

  objects[catalogNumber] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`;

  const kids = pageObjectNumbers.map((number) => `${number} 0 R`).join(" ");
  objects[pagesNumber] = `<< /Type /Pages /Count ${document.pages.length} /Kids [${kids}] >>`;

  for (const font of FONT_KEYS) {
    const number = fontNumbers.get(font) ?? 0;
    objects[number] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[font]} /Encoding /WinAnsiEncoding >>`;
  }

  objects[infoNumber] =
    `<< /Title (${escapePdfText(document.title)}) ` +
    `/Author (${escapePdfText(document.author)}) ` +
    (document.subject ? `/Subject (${escapePdfText(document.subject)}) ` : "") +
    `/Producer (ESCRIBIENDO) /Creator (ESCRIBIENDO) ` +
    `/CreationDate (${pdfDate(document.createdAt)}) /ModDate (${pdfDate(document.createdAt)}) ` +
    "/>>";

  document.pages.forEach((page, index) => {
    const pageNumber = pageObjectNumbers[index] ?? 0;
    const contentNumber = pageNumber + 1;

    const bleed = page.bleedMm ?? 0;
    // Las marcas de corte van fuera de la caja acabada, con o sin sangrado:
    // una imprenta puede pedirlas sin pedir sangre.
    const hasMarks = page.cropMarks === true;

    // La hoja física lleva el sangrado; las marcas van fuera de él.
    const mediaWidth = page.widthMm + bleed * 2 + (hasMarks ? CROP_MARK_LENGTH_MM * 2 : 0);
    const mediaHeight = page.heightMm + bleed * 2 + (hasMarks ? CROP_MARK_LENGTH_MM * 2 : 0);

    const trimX = (mediaWidth - page.widthMm) / 2;
    const trimY = (mediaHeight - page.heightMm) / 2;

    const content = pageContent(page, mediaHeight, trimX, trimY, hasMarks);

    objects[pageNumber] =
      `<< /Type /Page /Parent ${pagesNumber} 0 R ` +
      `/MediaBox [${toPoints(0)} ${toPoints(0)} ${toPoints(mediaWidth)} ${toPoints(mediaHeight)}] ` +
      `/CropBox [${toPoints(trimX)} ${toPoints(trimY)} ` +
      `${toPoints(trimX + page.widthMm)} ${toPoints(trimY + page.heightMm)}] ` +
      `/TrimBox [${toPoints(trimX)} ${toPoints(trimY)} ` +
      `${toPoints(trimX + page.widthMm)} ${toPoints(trimY + page.heightMm)}] ` +
      (bleed > 0
        ? `/BleedBox [${toPoints(trimX - bleed)} ${toPoints(trimY - bleed)} ` +
          `${toPoints(trimX + page.widthMm + bleed)} ${toPoints(trimY + page.heightMm + bleed)}] `
        : "") +
      `/Resources << /Font << ` +
      FONT_KEYS.map(
        (font) => `/F${FONT_KEYS.indexOf(font) + 1} ${fontNumbers.get(font) ?? 0} 0 R`,
      ).join(" ") +
      ` >> >> /Contents ${contentNumber} 0 R >>`;

    objects[contentNumber] = `stream\n${content}\nendstream`;
  });

  // Ensamblado: cabecera, objetos y tabla de referencias cruzadas.
  const parts: string[] = [];
  const offsets: number[] = [];
  let position = 0;

  const push = (text: string): void => {
    parts.push(text);
    position += text.length;
  };

  push("%PDF-1.4\n%âãÏÓ\n");

  for (let number = 1; number < objects.length; number += 1) {
    const body = objects[number];

    if (body === undefined || body === "") {
      continue;
    }

    offsets[number] = position;
    push(`${number} 0 obj\n${body}\nendobj\n`);
  }

  const xrefOffset = position;
  const size = objects.length;

  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;

  for (let number = 1; number < size; number += 1) {
    const offset = offsets[number];

    if (offset === undefined) {
      xref += "0000000000 65535 f \n";
      continue;
    }

    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  push(xref);
  push(
    `trailer\n<< /Size ${size} /Root ${catalogNumber} 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return latin1ToBytes(parts.join(""));
}

function toPoints(mm: number): string {
  return (mm * MM_TO_POINTS).toFixed(3);
}

/** Flujo de contenido de una página. */
function pageContent(
  page: PdfPage,
  mediaHeightMm: number,
  trimXMm: number,
  trimYMm: number,
  hasMarks: boolean,
): string {
  const parts: string[] = [];

  if (hasMarks) {
    parts.push(marksContent(page, mediaHeightMm, trimXMm, trimYMm));
  }

  for (const run of page.runs) {
    if (run.text.length === 0) {
      continue;
    }

    const fontIndex = FONT_KEYS.indexOf(run.font) + 1;
    const x = (trimXMm + run.xMm) * MM_TO_POINTS;
    const y = (mediaHeightMm - trimYMm - run.baselineMm) * MM_TO_POINTS;
    const spacing =
      run.wordSpacing && run.wordSpacing > 0 ? `${run.wordSpacing.toFixed(3)} Tw ` : "0 Tw ";

    parts.push(
      `BT /F${fontIndex} ${run.sizePt.toFixed(2)} Tf ${spacing}1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm (${escapePdfText(run.text)}) Tj ET`,
    );
  }

  return parts.join("\n");
}

/** Marcas de corte y de registro. */
function marksContent(
  page: PdfPage,
  mediaHeightMm: number,
  trimXMm: number,
  trimYMm: number,
): string {
  const parts: string[] = ["0.5 w", "0 0 0 RG"];
  const length = CROP_MARK_LENGTH_MM;
  const gap = CROP_MARK_GAP_MM;

  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    parts.push(
      `${(x1 * MM_TO_POINTS).toFixed(3)} ${(y1 * MM_TO_POINTS).toFixed(3)} m ` +
        `${(x2 * MM_TO_POINTS).toFixed(3)} ${(y2 * MM_TO_POINTS).toFixed(3)} l S`,
    );
  };

  const left = trimXMm;
  const right = trimXMm + page.widthMm;
  const bottom = trimYMm;
  const top = trimYMm + page.heightMm;

  // Marcas horizontales, arriba y abajo.
  line(left - gap - length, bottom, left - gap, bottom);
  line(right + gap, bottom, right + gap + length, bottom);
  line(left - gap - length, top, left - gap, top);
  line(right + gap, top, right + gap + length, top);

  // Marcas verticales, a los lados.
  line(left, bottom - gap - length, left, bottom - gap);
  line(left, top + gap, left, top + gap + length);
  line(right, bottom - gap - length, right, bottom - gap);
  line(right, top + gap, right, top + gap + length);

  // Marcas de registro: la línea de corte completa, muy fina.
  parts.push("0.25 w");
  line(left, bottom, right, bottom);
  line(left, top, right, top);
  line(left, bottom, left, top);
  line(right, bottom, right, top);

  void mediaHeightMm;

  return parts.join("\n");
}

/** Convierte una cadena Latin-1 en bytes. */
function latin1ToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);

  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }

  return bytes;
}
