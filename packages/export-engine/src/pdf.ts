/**
 * Escritor de PDF mínimo.
 *
 * Genera un PDF 1.4. Si recibe fuentes TrueType, las incrusta como objetos
 * `Type0`/`CIDFontType2` con codificación `Identity-H`, mapa `ToUnicode` y la
 * tabla de anchos real de la fuente. Si no las recibe, conserva la alternativa
 * de las fuentes estándar Times/WinAnsi para no romper los perfiles existentes.
 *
 * El texto se compone a partir de las líneas que ya decidió el motor de
 * paginación, de modo que el PDF y la vista previa coinciden.
 */

import {
  cidsToHex,
  encodeTrueTypeText,
  parseTrueTypeFont,
  toUnicodeCMap,
  type TrueTypeFont,
} from "./truetype";

/** Milímetros a puntos (1 pulgada = 72 puntos). */
export const MM_TO_POINTS = 72 / 25.4;

export type PdfFont = "regular" | "bold" | "italic" | "boldItalic";

/** Familias que el escritor puede incrustar. */
export type PdfFontFamily = "serif" | "sans-serif" | "monospace";

export interface PdfFontProgram {
  family: PdfFontFamily;
  style: PdfFont;
  /** Archivo TTF completo. */
  data: Uint8Array;
  /** Nombre PostScript de reserva si la tabla `name` no lo trae. */
  name?: string;
}

export interface PdfRun {
  text: string;
  font: PdfFont;
  /** Familia tipográfica; por defecto, serif. */
  family?: PdfFontFamily;
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
  /** Ancho del tramo, para dibujar el subrayado y el tachado. */
  widthMm?: number;
  underline?: boolean;
  strike?: boolean;
  /** Desplazamiento vertical de la línea base, en puntos (superíndices). */
  risePt?: number;
}

export interface PdfImage {
  /** Posición desde el borde superior de la caja acabada, en milímetros. */
  topMm: number;
  /** Posición desde el borde izquierdo de la caja acabada, en milímetros. */
  xMm: number;
  widthMm: number;
  heightMm: number;
  /** Bytes JPEG ya normalizados. Si faltan, se dibuja un marcador visible. */
  data?: Uint8Array;
  pixelWidth?: number;
  pixelHeight?: number;
  /** Texto alternativo, para el marcador y la accesibilidad. */
  alt?: string;
  src?: string;
}

/** Línea vectorial de una página, en milímetros desde la caja acabada. */
export interface PdfRule {
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
  /** Grosor en puntos. */
  widthPt?: number;
}

export interface PdfPage {
  /** Tamaño de la hoja acabada, en milímetros. */
  widthMm: number;
  heightMm: number;
  runs: PdfRun[];
  images?: PdfImage[];
  rules?: PdfRule[];
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
  /**
   * Fuentes TrueType que se pueden incrustar. Solo se procesan las caras que
   * usa el documento; las que falten caen a las fuentes estándar.
   */
  fonts?: PdfFontProgram[];
}

const FONTS: Record<PdfFont, string> = {
  regular: "Times-Roman",
  bold: "Times-Bold",
  italic: "Times-Italic",
  boldItalic: "Times-BoldItalic",
};

const FONT_KEYS: PdfFont[] = ["regular", "bold", "italic", "boldItalic"];

/**
 * Caracteres que WinAnsiEncoding no cubre de forma directa pero que sí
 * existen en la tabla de Win1252, que es la que declara el PDF.
 *
 * Sin esta tabla, las comillas tipográficas y la raya larga —tan frecuentes
 * en un texto en español— se perderían al exportar.
 */
const WINANSI_EXTRA: Record<string, string> = {
  "€": "", // €
  "‚": "", // comilla simple baja
  ƒ: "", // florín
  "„": "", // comillas dobles bajas
  "…": "", // puntos suspensivos
  "†": "", // daguer
  "‡": "", // doble daguer
  ˆ: "", // circunflejo
  "‰": "", // por mil
  Š: "", // S con acento
  "‹": "", // signos angulares simples
  Œ: "", // O con trazo
  Ž: "", // Z con acento
  "‘": "", // comilla simple izquierda
  "’": "", // comilla simple derecha
  "“": "", // comillas dobles izquierdas
  "”": "", // comillas dobles derechas
  "•": "", // viñeta
  "–": "", // raya corta
  "—": "", // raya larga
  "˜": "", // virgulilla
  "™": "", // marca registrada
  š: "", // s con acento
  "›": "", // signos angulares simples
  œ: "", // oe ligature
  ž: "", // z con acento
  Ÿ: "", // Y con acento
};

/**
 * Sustituciones para los caracteres que no tienen representación posible.
 *
 * No se pierden en silencio: se cambian por un signo visible y se cuentan
 * para que la interfaz pueda avisar de ello.
 */
const SIN_EQUIVALENTE = "□";

/** Resultado de preparar el texto para el PDF. */
export interface WinAnsiResult {
  text: string;
  /** Cuántos caracteres no se pudieron representar. */
  perdidos: number;
  /** Los caracteres distintos que se han perdido, sin repetir. */
  caracteresPerdidos: string[];
}

/**
 * Prepara el texto para una cadena literal de PDF con WinAnsiEncoding.
 *
 * Devuelve el texto convertido y el recuento de lo que no se ha podido
 * representar, de modo que la pérdida sea visible y no silenciosa.
 */
export function toWinAnsi(text: string): WinAnsiResult {
  let perdidos = 0;
  const perdidosSet = new Set<string>();
  let resultado = "";

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;

    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      resultado += `\\${character}`;
      continue;
    }

    if (code < 32) {
      resultado += " ";
      continue;
    }

    if (code < 127) {
      resultado += character;
      continue;
    }

    if (code < 256) {
      resultado += character;
      continue;
    }

    const equivalente = WINANSI_EXTRA[character];

    if (equivalente) {
      resultado += equivalente;
      continue;
    }

    perdidos += 1;
    perdidosSet.add(character);
    resultado += SIN_EQUIVALENTE;
  }

  return {
    text: resultado,
    perdidos,
    caracteresPerdidos: [...perdidosSet],
  };
}

interface PreparedImage {
  image: PdfImage;
  number: number;
  name: string;
}

export interface PdfResult {
  bytes: Uint8Array;
  /**
   * Caracteres que no se han podido representar y que se han sustituido por
   * un signo visible. La lista está vacía si no se ha perdido nada.
   */
  caracteresPerdidos: string[];
  /** Imágenes JPEG incrustadas en el archivo. */
  imagenesIncrustadas: number;
  /** Imágenes que no se han podido incrustar y se han marcado en la página. */
  imagenesOmitidas: number;
  /** Caras TrueType incrustadas realmente. */
  fuentesIncrustadas: number;
  /** Caras TrueType que no se han podido interpretar y han caído a Times. */
  fuentesOmitidas: number;
}

interface EmbeddedFont {
  font: TrueTypeFont;
  resourceName: string;
  type0Number: number;
}

function fontKey(family: PdfFontFamily | undefined, style: PdfFont): string {
  return `${family ?? "serif"}:${style}`;
}

/** Nombre válido para un diccionario PDF. */
function pdfName(name: string): string {
  const limpio = name.replace(/[^A-Za-z0-9_.-]/gu, "");
  return limpio.length > 0 ? limpio : "EmbeddedFont";
}

/** Flujo binario con su longitud declarada. */
function streamObject(data: Uint8Array, extra = ""): Uint8Array {
  return concatBytes([
    latin1ToBytes(`<< /Length ${data.length}${extra} >>\nstream\n`),
    data,
    latin1ToBytes("\nendstream"),
  ]);
}

/**
 * Crea los objetos PDF de una fuente TrueType completa.
 *
 * No se generan subconjuntos: la fuente se incrusta tal cual. A cambio, el
 * texto se puede extraer y buscar con `ToUnicode`, y el lector no depende de
 * las fuentes instaladas en el sistema.
 */
function createEmbeddedFont(
  font: TrueTypeFont,
  resourceName: string,
  family: PdfFontFamily,
  style: PdfFont,
  alloc: () => number,
  objects: (Uint8Array | undefined)[],
): EmbeddedFont {
  const fontFileNumber = alloc();
  objects[fontFileNumber] = streamObject(font.data, ` /Length1 ${font.data.length}`);

  const toUnicodeNumber = alloc();
  const cmap = toUnicodeCMap(font, pdfName(`ESCRIBIENDO-${resourceName}`));
  objects[toUnicodeNumber] = streamObject(latin1ToBytes(cmap));

  const descriptorNumber = alloc();
  const cidNumber = alloc();
  const type0Number = alloc();
  const scale = (value: number): number => Math.round((value * 1000) / font.unitsPerEm);
  const ascent = font.ascent || Math.round(font.unitsPerEm * 0.8);
  const descent = font.descent || -Math.round(font.unitsPerEm * 0.2);
  const capHeight = font.capHeight || Math.round(font.unitsPerEm * 0.7);
  const widths = font.advances.map((advance) => Math.round((advance * 1000) / font.unitsPerEm));
  let flags = 32;

  if (family === "serif") {
    flags |= 2;
  }

  if (family === "monospace" || font.fixedPitch) {
    flags |= 1;
  }

  if (style === "italic" || style === "boldItalic" || font.italicAngle !== 0) {
    flags |= 64;
  }

  const baseFont = pdfName(font.postScriptName);

  objects[descriptorNumber] = latin1ToBytes(
    `<< /Type /FontDescriptor /FontName /${baseFont} /Flags ${flags} ` +
      `/FontBBox [${scale(font.bounds.xMin)} ${scale(font.bounds.yMin)} ` +
      `${scale(font.bounds.xMax)} ${scale(font.bounds.yMax)}] ` +
      `/ItalicAngle ${font.italicAngle.toFixed(3)} /Ascent ${scale(ascent)} ` +
      `/Descent ${scale(descent)} /CapHeight ${scale(capHeight)} ` +
      `/StemV ${style === "bold" || style === "boldItalic" ? 120 : 80} ` +
      `/FontFile2 ${fontFileNumber} 0 R >>`,
  );

  objects[cidNumber] = latin1ToBytes(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseFont} ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptorNumber} 0 R /DW 1000 ` +
      `/W [0 [${widths.join(" ")}]] /CIDToGIDMap /Identity >>`,
  );

  objects[type0Number] = latin1ToBytes(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${baseFont} /Encoding /Identity-H ` +
      `/DescendantFonts [${cidNumber} 0 R] /ToUnicode ${toUnicodeNumber} 0 R >>`,
  );

  return { font, resourceName, type0Number };
}

function usedFontKeys(document: PdfDocument): Set<string> {
  const keys = new Set<string>();

  for (const page of document.pages) {
    for (const run of page.runs) {
      keys.add(fontKey(run.family, run.font));
    }

    if ((page.images?.length ?? 0) > 0) {
      keys.add(fontKey("serif", "regular"));
    }
  }

  return keys;
}

/**
 * Construye el PDF.
 *
 * Las imágenes se incrustan como objetos JPEG (`DCTDecode`). La aplicación
 * normaliza antes cualquier PNG, WebP o AVIF a JPEG RGB, de modo que el
 * escritor no tenga que interpretar todos los formatos gráficos.
 */
export function buildPdf(document: PdfDocument): PdfResult {
  // El objeto 0 está reservado por la especificación PDF; los objetos reales
  // empiezan en 1.
  const objects: (Uint8Array | undefined)[] = [undefined];
  const perdidos = new Set<string>();
  const alloc = (): number => {
    const number = objects.length;
    objects.push(undefined);
    return number;
  };

  const catalogNumber = alloc();
  const pagesNumber = alloc();
  const fontNumbers = new Map<PdfFont, number>();

  for (const font of FONT_KEYS) {
    fontNumbers.set(font, alloc());
  }

  const infoNumber = alloc();

  const embeddedFonts = new Map<string, EmbeddedFont>();
  const neededFonts = usedFontKeys(document);
  let fuentesIncrustadas = 0;
  let fuentesOmitidas = 0;
  let embeddedIndex = 0;

  for (const program of document.fonts ?? []) {
    const family = program.family ?? "serif";
    const key = fontKey(family, program.style);

    if (!neededFonts.has(key) || embeddedFonts.has(key)) {
      continue;
    }

    try {
      const font = parseTrueTypeFont(program.data, program.name);
      const resourceName = `E${embeddedIndex + 1}`;
      embeddedIndex += 1;

      embeddedFonts.set(
        key,
        createEmbeddedFont(font, resourceName, family, program.style, alloc, objects),
      );
      fuentesIncrustadas += 1;
    } catch {
      fuentesOmitidas += 1;
    }
  }

  const preparedByPage = new Map<number, Map<PdfImage, PreparedImage>>();
  let imagenesIncrustadas = 0;
  let imagenesOmitidas = 0;

  document.pages.forEach((page, pageIndex) => {
    const prepared = new Map<PdfImage, PreparedImage>();

    for (const image of page.images ?? []) {
      if (!image.data) {
        imagenesOmitidas += 1;
        continue;
      }

      const info = jpegInfo(image.data);

      if (!info) {
        imagenesOmitidas += 1;
        continue;
      }

      const objectNumber = alloc();
      const name = `Im${prepared.size + 1}`;

      objects[objectNumber] = imageObjectBody(image.data, info);
      prepared.set(image, { image, number: objectNumber, name });
      imagenesIncrustadas += 1;
    }

    preparedByPage.set(pageIndex, prepared);
  });

  const pageNumbers: number[] = [];
  const contentNumbers: number[] = [];

  for (const _page of document.pages) {
    pageNumbers.push(alloc());
    contentNumbers.push(alloc());
  }

  objects[catalogNumber] = latin1ToBytes(
    `<< /Type /Catalog /Pages ${pagesNumber} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`,
  );

  const kids = pageNumbers.map((number) => `${number} 0 R`).join(" ");
  objects[pagesNumber] = latin1ToBytes(
    `<< /Type /Pages /Count ${document.pages.length} /Kids [${kids}] >>`,
  );

  for (const font of FONT_KEYS) {
    const number = fontNumbers.get(font) ?? 0;
    objects[number] = latin1ToBytes(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[font]} /Encoding /WinAnsiEncoding >>`,
    );
  }

  objects[infoNumber] = latin1ToBytes(
    `<< /Title ${pdfTextString(document.title)} ` +
      `/Author ${pdfTextString(document.author)} ` +
      (document.subject ? `/Subject ${pdfTextString(document.subject)} ` : "") +
      `/Producer (ESCRIBIENDO) /Creator (ESCRIBIENDO) ` +
      `/CreationDate (${pdfDate(document.createdAt)}) /ModDate (${pdfDate(document.createdAt)}) ` +
      "/>>",
  );

  const embeddedResources = [...embeddedFonts.values()]
    .map((font) => `/${font.resourceName} ${font.type0Number} 0 R`)
    .join(" ");

  document.pages.forEach((page, index) => {
    const pageNumber = pageNumbers[index] ?? 0;
    const contentNumber = contentNumbers[index] ?? 0;
    const bleed = page.bleedMm ?? 0;
    const hasMarks = page.cropMarks === true;
    const mediaWidth = page.widthMm + bleed * 2 + (hasMarks ? CROP_MARK_LENGTH_MM * 2 : 0);
    const mediaHeight = page.heightMm + bleed * 2 + (hasMarks ? CROP_MARK_LENGTH_MM * 2 : 0);
    const trimX = (mediaWidth - page.widthMm) / 2;
    const trimY = (mediaHeight - page.heightMm) / 2;
    const prepared = preparedByPage.get(index) ?? new Map<PdfImage, PreparedImage>();
    const content = pageContent(
      page,
      mediaHeight,
      trimX,
      trimY,
      hasMarks,
      perdidos,
      prepared,
      embeddedFonts,
    );
    const xObjects =
      prepared.size > 0
        ? ` /XObject << ${[...prepared.values()]
            .map((entry) => `/${entry.name} ${entry.number} 0 R`)
            .join(" ")} >>`
        : "";

    objects[pageNumber] = latin1ToBytes(
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
        (embeddedResources ? ` ${embeddedResources}` : "") +
        ` >>${xObjects} >> /Contents ${contentNumber} 0 R >>`,
    );

    objects[contentNumber] = concatBytes([
      latin1ToBytes("stream\n"),
      latin1ToBytes(content),
      latin1ToBytes("\nendstream"),
    ]);
  });

  // Ensamblado: cabecera, objetos y tabla de referencias cruzadas. Los
  // desplazamientos se cuentan en bytes, no en caracteres, porque los flujos
  // de imagen contienen datos binarios.
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    position += bytes.length;
  };

  push(latin1ToBytes("%PDF-1.4\n%âãÏÓ\n"));

  for (let number = 1; number < objects.length; number += 1) {
    const body = objects[number];

    if (body === undefined) {
      continue;
    }

    offsets[number] = position;
    push(latin1ToBytes(`${number} 0 obj\n`));
    push(body);
    push(latin1ToBytes("\nendobj\n"));
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

  push(latin1ToBytes(xref));
  push(
    latin1ToBytes(
      `trailer\n<< /Size ${size} /Root ${catalogNumber} 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );

  return {
    bytes: concatBytes(chunks),
    caracteresPerdidos: [...perdidos],
    imagenesIncrustadas,
    imagenesOmitidas,
    fuentesIncrustadas,
    fuentesOmitidas,
  };
}

/** Longitud de las marcas de corte, en milímetros. */
const CROP_MARK_LENGTH_MM = 5;
/** Distancia entre la marca y el borde de la hoja acabada. */
const CROP_MARK_GAP_MM = 2;

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

function toPoints(mm: number): string {
  return (mm * MM_TO_POINTS).toFixed(3);
}

/** Operador de texto para una fuente incrustada. */
function embeddedTextOperator(
  font: EmbeddedFont,
  cids: readonly number[],
  wordSpacing: number | undefined,
  sizePt: number,
): string {
  if (!wordSpacing || wordSpacing <= 0 || sizePt <= 0) {
    return `<${cidsToHex(cids)}> Tj`;
  }

  const space = font.font.cmap.get(0x20);

  if (space === undefined) {
    return `<${cidsToHex(cids)}> Tj`;
  }

  // `Tw` no se aplica de forma fiable a los códigos de dos bytes de
  // Identity-H. El espacio extra se reparte con ajustes de `TJ`.
  const adjustment = ((-wordSpacing * 1000) / sizePt).toFixed(3);
  const chunks: string[] = [];
  let current: number[] = [];

  for (const cid of cids) {
    current.push(cid);

    if (cid === space) {
      chunks.push(`<${cidsToHex(current)}> ${adjustment}`);
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push(`<${cidsToHex(current)}>`);
  }

  return `[${chunks.join(" ")}] TJ`;
}

/** Flujo de contenido de una página. */
function pageContent(
  page: PdfPage,
  mediaHeightMm: number,
  trimXMm: number,
  trimYMm: number,
  hasMarks: boolean,
  perdidos: Set<string>,
  prepared: ReadonlyMap<PdfImage, PreparedImage>,
  embeddedFonts: ReadonlyMap<string, EmbeddedFont>,
): string {
  const parts: string[] = [];

  if (hasMarks) {
    parts.push(marksContent(page, trimXMm, trimYMm));
  }

  for (const rule of page.rules ?? []) {
    const x1 = (trimXMm + rule.x1Mm) * MM_TO_POINTS;
    const y1 = (mediaHeightMm - trimYMm - rule.y1Mm) * MM_TO_POINTS;
    const x2 = (trimXMm + rule.x2Mm) * MM_TO_POINTS;
    const y2 = (mediaHeightMm - trimYMm - rule.y2Mm) * MM_TO_POINTS;

    parts.push(
      "0 0 0 RG",
      `${(rule.widthPt ?? 0.5).toFixed(2)} w`,
      `${x1.toFixed(3)} ${y1.toFixed(3)} m ${x2.toFixed(3)} ${y2.toFixed(3)} l S`,
    );
  }

  for (const image of page.images ?? []) {
    const x = (trimXMm + image.xMm) * MM_TO_POINTS;
    const y = (mediaHeightMm - trimYMm - image.topMm - image.heightMm) * MM_TO_POINTS;
    const width = image.widthMm * MM_TO_POINTS;
    const height = image.heightMm * MM_TO_POINTS;
    const entry = prepared.get(image);

    if (entry) {
      parts.push(
        `q ${width.toFixed(3)} 0 0 ${height.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /${entry.name} Do Q`,
      );
      continue;
    }

    // Una imagen que no se ha podido resolver no desaparece en silencio: deja
    // un marco visible con su texto alternativo.
    parts.push(
      "0.92 g",
      `${x.toFixed(3)} ${y.toFixed(3)} ${width.toFixed(3)} ${height.toFixed(3)} re f`,
    );
    parts.push(
      "0.55 g",
      "0.5 w",
      `${x.toFixed(3)} ${y.toFixed(3)} ${width.toFixed(3)} ${height.toFixed(3)} re S`,
    );
    const labelText = image.alt?.trim() || "Imagen no disponible";
    const labelFont = embeddedFonts.get(fontKey("serif", "regular"));
    const labelSize = Math.min(9, Math.max(6, width / 24));
    const labelY = y + height / 2 - labelSize / 2;

    if (labelFont) {
      const label = encodeTrueTypeText(labelFont.font, labelText);

      for (const perdido of label.perdidos) {
        perdidos.add(perdido);
      }

      parts.push(
        `BT /${labelFont.resourceName} ${labelSize.toFixed(2)} Tf 0.25 g ` +
          `1 0 0 1 ${(x + 4).toFixed(3)} ${labelY.toFixed(3)} Tm ` +
          `<${cidsToHex(label.cids)}> Tj ET`,
      );
    } else {
      const label = toWinAnsi(labelText);

      for (const perdido of label.caracteresPerdidos) {
        perdidos.add(perdido);
      }

      parts.push(
        `BT /F1 ${labelSize.toFixed(2)} Tf 0.25 g 1 0 0 1 ${(x + 4).toFixed(3)} ${labelY.toFixed(3)} Tm (${label.text}) Tj ET`,
      );
    }
  }

  for (const run of page.runs) {
    if (run.text.length === 0) {
      continue;
    }

    const x = (trimXMm + run.xMm) * MM_TO_POINTS;
    const y = (mediaHeightMm - trimYMm - run.baselineMm) * MM_TO_POINTS;
    const rise = run.risePt !== undefined ? `${run.risePt.toFixed(3)} Ts ` : "";
    const embedded = embeddedFonts.get(fontKey(run.family, run.font));

    if (embedded) {
      const preparado = encodeTrueTypeText(embedded.font, run.text);

      for (const perdido of preparado.perdidos) {
        perdidos.add(perdido);
      }

      parts.push(
        `BT /${embedded.resourceName} ${run.sizePt.toFixed(2)} Tf ${rise}` +
          `1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm ` +
          `${embeddedTextOperator(embedded, preparado.cids, run.wordSpacing, run.sizePt)} ET`,
      );
    } else {
      const fontIndex = FONT_KEYS.indexOf(run.font) + 1;
      const spacing =
        run.wordSpacing && run.wordSpacing > 0 ? `${run.wordSpacing.toFixed(3)} Tw ` : "0 Tw ";
      const preparado = toWinAnsi(run.text);

      for (const perdido of preparado.caracteresPerdidos) {
        perdidos.add(perdido);
      }

      parts.push(
        `BT /F${fontIndex} ${run.sizePt.toFixed(2)} Tf ${rise}${spacing}1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm (${preparado.text}) Tj ET`,
      );
    }

    // Subrayado y tachado se dibujan como una línea fina sobre el texto. Las
    // fuentes estándar no traen esos trazos, así que se trazan aparte.
    if (run.widthMm !== undefined && (run.underline || run.strike)) {
      const desde = (trimXMm + run.xMm) * MM_TO_POINTS;
      const hasta = (trimXMm + run.xMm + run.widthMm) * MM_TO_POINTS;
      const grosor = Math.max(0.4, run.sizePt * 0.05);

      parts.push("0 0 0 RG", `${grosor.toFixed(2)} w`);

      if (run.underline) {
        const linea = y - run.sizePt * 0.12;

        parts.push(
          `${desde.toFixed(3)} ${linea.toFixed(3)} m ${hasta.toFixed(3)} ${linea.toFixed(3)} l S`,
        );
      }

      if (run.strike) {
        const linea = y + run.sizePt * 0.28;

        parts.push(
          `${desde.toFixed(3)} ${linea.toFixed(3)} m ${hasta.toFixed(3)} ${linea.toFixed(3)} l S`,
        );
      }
    }
  }

  return parts.join("\n");
}

/** Marcas de corte y de registro. */
function marksContent(page: PdfPage, trimXMm: number, trimYMm: number): string {
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

  return parts.join("\n");
}

/** Cadena de texto PDF en UTF-16BE, para metadatos con Unicode. */
function pdfTextString(text: string): string {
  let hex = "FEFF";

  for (let index = 0; index < text.length; index += 1) {
    hex += text.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
  }

  return `<${hex}>`;
}

interface JpegInfo {
  width: number;
  height: number;
  components: number;
}

/** Lee dimensiones y componentes de la cabecera de un JPEG. */
function jpegInfo(data: Uint8Array): JpegInfo | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 4 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = data[offset + 1] ?? 0;

    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    if (marker === 0xda) {
      break;
    }

    const length = ((data[offset + 2] ?? 0) << 8) | (data[offset + 3] ?? 0);

    if (length < 2 || offset + 2 + length > data.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      const height = ((data[offset + 5] ?? 0) << 8) | (data[offset + 6] ?? 0);
      const width = ((data[offset + 7] ?? 0) << 8) | (data[offset + 8] ?? 0);
      const components = data[offset + 9] ?? 0;

      return width > 0 && height > 0 && components > 0 ? { width, height, components } : null;
    }

    offset += 2 + length;
  }

  return null;
}

/** Objeto PDF de imagen JPEG. */
function imageObjectBody(data: Uint8Array, info: JpegInfo): Uint8Array {
  const colorSpace =
    info.components === 1 ? "DeviceGray" : info.components === 3 ? "DeviceRGB" : "DeviceCMYK";
  const decode = info.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : "";
  const dictionary =
    `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
    `/ColorSpace /${colorSpace} /BitsPerComponent 8${decode} /Filter /DCTDecode ` +
    `/Length ${data.length} >>\nstream\n`;

  return concatBytes([latin1ToBytes(dictionary), data, latin1ToBytes("\nendstream")]);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/** Convierte una cadena Latin-1 en bytes. */
function latin1ToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);

  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }

  return bytes;
}
