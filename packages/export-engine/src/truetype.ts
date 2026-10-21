/**
 * Lector mínimo de fuentes TrueType y métricas para el PDF.
 *
 * No se intenta interpretar todos los formatos de fuente: se aceptan fuentes
 * TrueType con tablas `glyf`/`loca`, que son las que usa Liberation. No se
 * generan subconjuntos; la fuente completa se incrusta en el PDF y el texto se
 * codifica con `Identity-H` y el mapa `cmap` de la propia fuente.
 *
 * El objetivo es no depender de las fuentes del sistema del lector y conservar
 * los caracteres Unicode que la fuente tenga dibujados. Las sustituciones se
 * cuentan y se devuelven, nunca se pierden en silencio.
 */

export interface TrueTypeBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface TrueTypeFont {
  /** Bytes completos de la fuente, para incrustarlos como `FontFile2`. */
  data: Uint8Array;
  unitsPerEm: number;
  numGlyphs: number;
  /** Ancho de cada glifo, en unidades de la fuente. */
  advances: number[];
  /** Unicode a identificador de glifo. */
  cmap: Map<number, number>;
  /** Identificador de glifo a Unicode; se usa para el mapa `ToUnicode`. */
  glyphToUnicode: Map<number, number>;
  bounds: TrueTypeBounds;
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  fixedPitch: boolean;
  postScriptName: string;
}

interface TableRecord {
  offset: number;
  length: number;
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function i16(view: DataView, offset: number): number {
  return view.getInt16(offset, false);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function i32(view: DataView, offset: number): number {
  return view.getInt32(offset, false);
}

function tag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function tableMap(view: DataView): Map<string, TableRecord> {
  if (view.byteLength < 12) {
    throw new Error("La fuente TrueType está truncada.");
  }

  const signature = u32(view, 0);
  const sfnt = signature === 0x00010000 || signature === 0x74727565; // `true`

  if (!sfnt) {
    throw new Error("El archivo no es una fuente TrueType con tablas glyf.");
  }

  const count = u16(view, 4);
  const result = new Map<string, TableRecord>();

  for (let index = 0; index < count; index += 1) {
    const offset = 12 + index * 16;

    if (offset + 16 > view.byteLength) {
      throw new Error("La tabla de fuentes TrueType está truncada.");
    }

    const record = {
      offset: u32(view, offset + 8),
      length: u32(view, offset + 12),
    };

    if (record.offset + record.length > view.byteLength) {
      throw new Error("Una tabla de la fuente TrueType apunta fuera del archivo.");
    }

    result.set(tag(view, offset), record);
  }

  return result;
}

function requiredTable(tables: Map<string, TableRecord>, name: string): TableRecord {
  const table = tables.get(name);

  if (!table) {
    throw new Error(`La fuente TrueType no tiene la tabla ${name}.`);
  }

  return table;
}

function decodeName(
  data: Uint8Array,
  view: DataView,
  record: TableRecord,
  platform: number,
  length: number,
  offset: number,
): string {
  const bytes = data.subarray(record.offset + offset, record.offset + offset + length);
  let text = "";

  if (platform === 3) {
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0));
    }
  } else {
    for (const byte of bytes) {
      text += String.fromCharCode(byte);
    }
  }

  return text.replace(/\0/gu, "").trim();
}

function parsePostScriptName(
  data: Uint8Array,
  view: DataView,
  table: TableRecord | undefined,
): string {
  if (!table || table.length < 6) {
    return "";
  }

  try {
    const count = u16(view, table.offset + 2);
    const strings = table.offset + u16(view, table.offset + 4);
    const candidates: { score: number; value: string }[] = [];

    for (let index = 0; index < count; index += 1) {
      const record = table.offset + 6 + index * 12;

      if (record + 12 > table.offset + table.length) {
        break;
      }

      const platform = u16(view, record);
      const language = u16(view, record + 4);
      const name = u16(view, record + 6);
      const length = u16(view, record + 8);
      const offset = u16(view, record + 10);

      if (name !== 6 || length === 0 || strings + offset + length > data.length) {
        continue;
      }

      const value = decodeName(
        data,
        view,
        table,
        platform,
        length,
        strings + offset - table.offset,
      );
      const score = (platform === 3 ? 10 : platform === 1 ? 5 : 0) + (language === 0x409 ? 2 : 0);

      if (value) {
        candidates.push({ score, value });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.value ?? "";
  } catch {
    return "";
  }
}

function parseCmap(view: DataView, table: TableRecord, numGlyphs: number): Map<number, number> {
  const count = u16(view, table.offset + 2);
  let best: { score: number; offset: number; format: number } | null = null;

  for (let index = 0; index < count; index += 1) {
    const record = table.offset + 4 + index * 8;

    if (record + 8 > table.offset + table.length) {
      break;
    }

    const platform = u16(view, record);
    const encoding = u16(view, record + 2);
    const offset = table.offset + u32(view, record + 4);

    if (offset + 2 > table.offset + table.length) {
      continue;
    }

    const format = u16(view, offset);
    let score = 0;

    if (platform === 3 && encoding === 10) {
      score = 100;
    } else if (platform === 0 && (encoding === 4 || encoding === 6)) {
      score = 90;
    } else if (platform === 3 && encoding === 1) {
      score = 80;
    } else if (platform === 0) {
      score = 70;
    } else if (platform === 1 && encoding === 0) {
      score = 20;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { score, offset, format };
    }
  }

  if (!best) {
    throw new Error("La fuente TrueType no tiene una tabla cmap Unicode.");
  }

  const map = new Map<number, number>();

  if (best.format === 4) {
    const segCount = u16(view, best.offset + 6) / 2;
    const endBase = best.offset + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;

    for (let index = 0; index < segCount; index += 1) {
      const start = u16(view, startBase + index * 2);
      const end = u16(view, endBase + index * 2);
      const delta = i16(view, deltaBase + index * 2);
      const rangeOffset = u16(view, rangeBase + index * 2);

      for (let codepoint = start; codepoint <= end && codepoint !== 0xffff; codepoint += 1) {
        let glyph: number;

        if (rangeOffset === 0) {
          glyph = (codepoint + delta) & 0xffff;
        } else {
          const glyphOffset = rangeBase + index * 2 + rangeOffset + (codepoint - start) * 2;

          if (glyphOffset + 2 > view.byteLength) {
            continue;
          }

          glyph = u16(view, glyphOffset);

          if (glyph !== 0) {
            glyph = (glyph + delta) & 0xffff;
          }
        }

        if (glyph > 0 && glyph < numGlyphs) {
          map.set(codepoint, glyph);
        }
      }
    }
  } else if (best.format === 12) {
    const groups = u32(view, best.offset + 8);

    for (let index = 0; index < groups; index += 1) {
      const record = best.offset + 12 + index * 12;

      if (record + 12 > view.byteLength) {
        break;
      }

      const start = u32(view, record);
      const end = u32(view, record + 4);
      const startGlyph = u32(view, record + 8);

      for (let codepoint = start; codepoint <= end; codepoint += 1) {
        const glyph = startGlyph + (codepoint - start);

        if (glyph > 0 && glyph < numGlyphs) {
          map.set(codepoint, glyph);
        }
      }
    }
  } else if (best.format === 6) {
    const first = u16(view, best.offset + 6);
    const entries = u16(view, best.offset + 8);

    for (let index = 0; index < entries; index += 1) {
      const glyph = u16(view, best.offset + 10 + index * 2);

      if (glyph > 0 && glyph < numGlyphs) {
        map.set(first + index, glyph);
      }
    }
  } else if (best.format === 0) {
    for (let codepoint = 0; codepoint < 256; codepoint += 1) {
      const glyph = view.getUint8(best.offset + 6 + codepoint);

      if (glyph > 0 && glyph < numGlyphs) {
        map.set(codepoint, glyph);
      }
    }
  } else {
    throw new Error(`La tabla cmap usa un formato no admitido (${best.format}).`);
  }

  if (map.size === 0) {
    throw new Error("La tabla cmap de la fuente está vacía.");
  }

  return map;
}

/**
 * Lee una fuente TrueType completa.
 *
 * Lanza un error si falta una tabla imprescindible. El llamador decide si cae
 * a las fuentes estándar; no se inventan métricas cuando la fuente no es
 * válida.
 */
export function parseTrueTypeFont(data: Uint8Array, fallbackName = "EmbeddedFont"): TrueTypeFont {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = tableMap(view);
  const head = requiredTable(tables, "head");
  const maxp = requiredTable(tables, "maxp");
  const hhea = requiredTable(tables, "hhea");
  const hmtx = requiredTable(tables, "hmtx");
  const unitsPerEm = u16(view, head.offset + 18);
  const numGlyphs = u16(view, maxp.offset + 4);
  const numberOfHMetrics = u16(view, hhea.offset + 34);

  if (unitsPerEm === 0 || numGlyphs === 0 || numberOfHMetrics === 0) {
    throw new Error("La fuente TrueType tiene métricas vacías.");
  }

  const advances: number[] = [];
  let lastAdvance = 0;

  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    if (glyph < numberOfHMetrics) {
      const offset = hmtx.offset + glyph * 4;

      if (offset + 2 > hmtx.offset + hmtx.length) {
        throw new Error("La tabla hmtx de la fuente está truncada.");
      }

      lastAdvance = u16(view, offset);
    }

    advances.push(lastAdvance);
  }

  const cmap = parseCmap(view, requiredTable(tables, "cmap"), numGlyphs);
  const glyphToUnicode = new Map<number, number>();

  for (const [codepoint, glyph] of cmap) {
    const previous = glyphToUnicode.get(glyph);

    if (previous === undefined || codepoint < previous) {
      glyphToUnicode.set(glyph, codepoint);
    }
  }

  const bbox = {
    xMin: i16(view, head.offset + 36),
    yMin: i16(view, head.offset + 38),
    xMax: i16(view, head.offset + 40),
    yMax: i16(view, head.offset + 42),
  };
  let ascent = i16(view, hhea.offset + 4);
  let descent = i16(view, hhea.offset + 6);
  let capHeight = Math.round(ascent * 0.7);
  const os2 = tables.get("OS/2");

  if (os2 && os2.length >= 90 && u16(view, os2.offset) >= 2) {
    const typoAscent = i16(view, os2.offset + 68);
    const typoDescent = i16(view, os2.offset + 70);
    const os2CapHeight = i16(view, os2.offset + 88);

    if (ascent === 0) {
      ascent = typoAscent;
    }

    if (descent === 0) {
      descent = typoDescent;
    }

    if (os2CapHeight > 0) {
      capHeight = os2CapHeight;
    }
  }

  const post = tables.get("post");
  let italicAngle = 0;
  let fixedPitch = false;

  if (post && post.length >= 16) {
    italicAngle = i32(view, post.offset + 4) / 65536;
    fixedPitch = u32(view, post.offset + 12) !== 0;
  }

  const postScriptName =
    sanitizePostScriptName(parsePostScriptName(data, view, tables.get("name"))) || fallbackName;

  return {
    data,
    unitsPerEm,
    numGlyphs,
    advances,
    cmap,
    glyphToUnicode,
    bounds: bbox,
    ascent,
    descent,
    capHeight,
    italicAngle,
    fixedPitch,
    postScriptName,
  };
}

function sanitizePostScriptName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/gu, "");
}

/** Identificador de glifo para un carácter, con sustituto visible si falta. */
export function glyphForCodepoint(font: TrueTypeFont, codepoint: number): number {
  return font.cmap.get(codepoint) ?? font.cmap.get(0xfffd) ?? font.cmap.get(0x3f) ?? 0;
}

/** Ancho de un texto en puntos, con la tabla `hmtx` real. */
export function measureTrueTypeTextPoints(
  font: TrueTypeFont,
  text: string,
  sizePt: number,
  letterSpacingPt = 0,
): number {
  let width = 0;
  let characters = 0;

  for (const character of text) {
    const codepoint = character.codePointAt(0) ?? 0;
    const glyph = glyphForCodepoint(font, codepoint);
    width += (font.advances[glyph] ?? 0) / font.unitsPerEm;
    characters += 1;
  }

  return width * sizePt + letterSpacingPt * characters;
}

/** Texto codificado para `Identity-H`, con los caracteres que no existen. */
export interface EncodedTrueTypeText {
  cids: number[];
  perdidos: string[];
  /** Verdadero si algún carácter usó el signo de sustitución. */
  sustituido: boolean;
}

export function encodeTrueTypeText(font: TrueTypeFont, text: string): EncodedTrueTypeText {
  const cids: number[] = [];
  const perdidos = new Set<string>();
  let sustituido = false;

  for (const character of text) {
    let codepoint = character.codePointAt(0) ?? 0;

    if (codepoint < 32) {
      codepoint = 0x20;
    }

    let glyph = font.cmap.get(codepoint);

    if (glyph === undefined) {
      perdidos.add(character);
      sustituido = true;
      glyph = font.cmap.get(0xfffd) ?? font.cmap.get(0x3f) ?? 0;
    }

    cids.push(glyph);
  }

  return { cids, perdidos: [...perdidos], sustituido };
}

/** Cadena hexadecimal de CIDs de cuatro dígitos, como exige Identity-H. */
export function cidsToHex(cids: readonly number[]): string {
  return cids
    .map((cid) => (cid & 0xffff).toString(16).padStart(4, "0"))
    .join("")
    .toUpperCase();
}

/** Convierte un punto de código a la forma UTF-16BE que usa ToUnicode. */
function unicodeHex(codepoint: number): string {
  if (codepoint <= 0xffff) {
    return codepoint.toString(16).padStart(4, "0").toUpperCase();
  }

  const value = codepoint - 0x10000;
  const high = 0xd800 + (value >> 10);
  const low = 0xdc00 + (value & 0x3ff);

  return `${high.toString(16).padStart(4, "0")}${low.toString(16).padStart(4, "0")}`.toUpperCase();
}

/**
 * Mapa `ToUnicode` para todos los glifos que tienen un Unicode asociado.
 *
 * Se agrupan las entradas de cien en cien porque algunos lectores no aceptan
 * bloques `bfchar` mayores.
 */
export function toUnicodeCMap(font: TrueTypeFont, name: string): string {
  const entries = [...font.glyphToUnicode.entries()]
    .filter(([glyph, codepoint]) => glyph > 0 && glyph < font.numGlyphs && codepoint >= 0)
    .sort((left, right) => left[0] - right[0]);
  const chunks: string[] = [];

  for (let start = 0; start < entries.length; start += 100) {
    const block = entries.slice(start, start + 100);

    chunks.push(`${block.length} beginbfchar`);
    for (const [glyph, codepoint] of block) {
      chunks.push(
        `<${(glyph & 0xffff).toString(16).padStart(4, "0").toUpperCase()}> <${unicodeHex(codepoint)}>`,
      );
    }
    chunks.push("endbfchar");
  }

  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /${name} def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${chunks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}
