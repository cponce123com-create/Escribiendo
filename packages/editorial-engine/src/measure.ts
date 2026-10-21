import type { FontFamilyId } from "./typography";

/**
 * Medición del texto para la maquetación.
 *
 * El motor no carga fuentes por sí mismo: por defecto mide con un modelo
 * determinista de anchos medios por tipo de carácter. Ese modelo es una
 * aproximación suficiente para detectar problemas de composición, y sirve de
 * reserva cuando no hay una fuente real disponible.
 *
 * Cuando sí la hay, se inyecta un medidor real (`MeasureText`) que devuelve
 * los anchos de la propia fuente. La aplicación lo hace con las métricas de
 * `hmtx` de las fuentes que después se incrustan en el PDF, de modo que la
 * paginación y la composición coinciden.
 */

/** Ancho medio de carácter como fracción del tamaño de letra. */
const NARROW = 0.31;
const WIDE = 0.86;
const UPPER = 0.63;
const DIGIT = 0.55;
const LOWER = 0.5;
const SPACE = 0.26;

/** Multiplicadores por familia tipográfica. */
const FAMILY_FACTOR: Record<FontFamilyId, number> = {
  serif: 1,
  "sans-serif": 1.06,
  monospace: 1.2,
};

const NARROW_CHARS = new Set([..."ijltfrI.,;:!|'’¡()[]{}/\\-«»"]);

/**
 * Medidor real de una fuente. Devuelve puntos, no milímetros, para que pueda
 * sustituir al modelo aproximado sin cambiar las unidades del motor.
 */
export type MeasureText = (text: string, options: MeasureOptions) => number;

export interface MeasureOptions {
  fontFamily: FontFamilyId;
  fontSizePt: number;
  letterSpacingPt?: number;
  uppercase?: boolean;
  smallCaps?: boolean;
  /**
   * La negrita ocupa algo más que la redonda. No se simula engordando la
   * letra: se aplica un factor de ancho, que es lo que hace una fuente real
   * al pasar de redonda a negra.
   */
  bold?: boolean;
  /**
   * El tramo va en cursiva. El modelo aproximado no distingue la cursiva; un
   * medidor real sí, porque cada cara tiene sus propios anchos.
   */
  italic?: boolean;
  /** Medición real; si falta, se usa el modelo aproximado. */
  measure?: MeasureText;
}

/** Ensanchamiento medio de la negrita respecto a la redonda. */
const BOLD_FACTOR = 1.03;

/** Ancho de un texto en puntos. */
export function measureTextPoints(text: string, options: MeasureOptions): number {
  if (text.length === 0) {
    return 0;
  }

  if (options.measure) {
    return options.measure(text, options);
  }

  const factor = FAMILY_FACTOR[options.fontFamily];
  const letterSpacing = options.letterSpacingPt ?? 0;
  let total = 0;

  for (const character of text) {
    total += characterWidth(character, options) * factor;
  }

  const spacing = letterSpacing * text.length;
  const weight = options.bold ? BOLD_FACTOR : 1;

  return (total * options.fontSizePt + spacing) * weight;
}

/** Anchura de un carácter en em (fracciones del tamaño de letra). */
function characterWidth(character: string, options: MeasureOptions): number {
  if (options.uppercase) {
    return UPPER;
  }

  if (character === " ") {
    return SPACE;
  }

  if (NARROW_CHARS.has(character)) {
    return NARROW;
  }

  if (/[\d]/.test(character)) {
    return DIGIT;
  }

  if (/[\p{Lu}]/u.test(character)) {
    return options.smallCaps ? UPPER * 0.86 : UPPER;
  }

  if (/[mwMW@%&]/.test(character)) {
    return WIDE;
  }

  return LOWER;
}

/** Ancho de un texto en milímetros. */
export function measureTextMm(text: string, options: MeasureOptions): number {
  return (measureTextPoints(text, options) * 25.4) / 72;
}

/**
 * Parte un texto en palabras, conservando los espacios como separadores.
 *
 * Un espacio no separable (por ejemplo dentro de «no se rompe») se trata
 * como si fuera una palabra, porque no puede acabar en fin de línea.
 */
export function splitWords(text: string): string[] {
  const normalized = text.replace(/\s+/gu, " ").trim();

  if (normalized.length === 0) {
    return [];
  }

  return normalized.split(" ").filter((word) => word.length > 0);
}

export interface LineBreak {
  text: string;
  /** Último carácter de la línea: indica si se parte por guionado. */
  hyphenated: boolean;
  /** `true` si la línea no cabe ni con la palabra más corta. */
  overflow: boolean;
}

export interface BreakOptions extends MeasureOptions {
  /** Ancho útil de la línea, en milímetros. */
  lineWidthMm: number;
  /** Sangría de la primera línea, en milímetros. */
  firstLineIndentMm?: number;
  hyphenation?: boolean;
}

/**
 * Parte un párrafo en líneas.
 *
 * El reparto es codicioso: se mete el mayor número de palabras que cabe. Con
 * guionado, una palabra que no cabe se parte por la sílaba más larga posible.
 */
export function breakIntoLines(text: string, options: BreakOptions): LineBreak[] {
  const words = splitWords(text);

  if (words.length === 0) {
    return [];
  }

  const lines: LineBreak[] = [];
  const hyphenation = options.hyphenation ?? false;
  const spaceWidth = measureTextMm(" ", options);

  let current: string[] = [];
  let currentWidth = 0;
  let isFirstLine = true;

  const availableWidth = (): number => {
    const indent = isFirstLine ? (options.firstLineIndentMm ?? 0) : 0;
    return options.lineWidthMm - indent;
  };

  const pushLine = (wordsInLine: string[], overflow: boolean, hyphenated: boolean): void => {
    lines.push({ text: wordsInLine.join(" "), overflow, hyphenated });
    current = [];
    currentWidth = 0;
    isFirstLine = false;
  };

  for (const word of words) {
    const wordWidth = measureTextMm(word, options);
    const separator = current.length > 0 ? spaceWidth : 0;

    if (currentWidth + separator + wordWidth <= availableWidth()) {
      current.push(word);
      currentWidth += separator + wordWidth;
      continue;
    }

    // La palabra no cabe en una línea con lo que ya hay.
    if (current.length > 0) {
      pushLine(current, false, false);
    }

    if (wordWidth <= availableWidth()) {
      current.push(word);
      currentWidth = wordWidth;
      continue;
    }

    // La palabra sola no cabe: se intenta partir por guionado.
    if (hyphenation) {
      const fragment = splitWordToFit(word, availableWidth(), options);

      if (fragment) {
        current.push(fragment);
        pushLine(current, false, true);

        const rest = word.slice(fragment.length);
        const restWidth = measureTextMm(rest, options);

        if (restWidth <= availableWidth()) {
          current = [rest];
          currentWidth = restWidth;
        } else {
          const second = splitWordToFit(rest, availableWidth(), options);

          if (second) {
            current = [second];
            currentWidth = measureTextMm(second, options);
          } else {
            pushLine([rest], true, false);
          }
        }

        continue;
      }
    }

    // Sin guiado posible: la palabra desborda la línea.
    pushLine([word], true, false);
  }

  if (current.length > 0) {
    pushLine(current, false, false);
  }

  return lines;
}

/**
 * Parte una palabra en el fragmento más largo que cabe en el ancho dado.
 *
 * No es un particionador silábico: corta por el guion existente más cercano
 * al límite. Si la palabra no tiene guion, no se parte: una palabra entera
 * que no cabe es un problema de la maqueta, no algo que se deba resolver
 * partiendo la palabra a la fuerza.
 */
function splitWordToFit(word: string, widthMm: number, options: MeasureOptions): string | null {
  const separators = /[-‐‑–—/]/gu;

  let best: string | null = null;
  let match: RegExpExecArray | null;

  separators.lastIndex = 0;

  while ((match = separators.exec(word)) !== null) {
    const candidate = word.slice(0, match.index + 1);

    if (measureTextMm(candidate, options) <= widthMm) {
      best = candidate;
    } else {
      break;
    }
  }

  if (best) {
    return best;
  }

  // Sin guion: se descarta partir la palabra.
  return null;
}
