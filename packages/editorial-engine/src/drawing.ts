import { measureTextMm, type MeasureText } from "./measure";
import { isHeadingKind, type LaidOutBlock } from "./pagination";

/** Métricas verticales de Liberation: ascenso y descenso en em. */
const LIBERATION_VERTICAL_METRICS = {
  serif: { ascent: 0.891, descent: 0.216 },
  "sans-serif": { ascent: 0.905, descent: 0.212 },
  monospace: { ascent: 0.833, descent: 0.3 },
} as const;

/**
 * Desplazamiento que alinea la línea base CSS con el 80 % de la línea,
 * que es donde la fija el escritor de PDF.
 */
export function baselineCorrectionPt(
  fontFamily: LaidOutBlock["style"]["fontFamily"],
  fontSizePt: number,
  lineHeightPt: number,
): number {
  const metrics = LIBERATION_VERTICAL_METRICS[fontFamily];
  const leadingPt = lineHeightPt - fontSizePt * (metrics.ascent + metrics.descent);
  const cssBaselinePt = leadingPt / 2 + fontSizePt * metrics.ascent;

  return lineHeightPt * 0.8 - cssBaselinePt;
}

/**
 * Desplazamiento de la inicial capitular.
 *
 * La letra se compone al triple del cuerpo y su línea base baja lo mismo que
 * sube su altura: así ocupa las tres primeras líneas del párrafo, igual que
 * en el PDF. Sin este ajuste la inicial quedaría levantada sobre el primer
 * renglón y la vista previa no coincidiría con el archivo.
 */
export function dropCapCorrectionPt(
  fontFamily: LaidOutBlock["style"]["fontFamily"],
  fontSizePt: number,
  lineHeightPt: number,
  lines: number = 3,
): number {
  const metrics = LIBERATION_VERTICAL_METRICS[fontFamily];
  const capitalSizePt = fontSizePt * lines;

  return (
    baselineCorrectionPt(fontFamily, capitalSizePt, lineHeightPt) +
    (capitalSizePt - fontSizePt) * metrics.ascent
  );
}

export interface TextLinePlacement {
  xMm: number;
  widthMm: number;
  naturalWidthMm: number;
  wordSpacingPt: number;
  bold: boolean;
}

/**
 * Calcula la caja horizontal compartida por el PDF y la vista previa.
 * `xMm` es la coordenada desde el borde izquierdo de la página.
 */
export function textLinePlacement(
  block: LaidOutBlock,
  lineIndex: number,
  textWidthMm: number,
  leftMm: number,
  measure?: MeasureText,
): TextLinePlacement {
  const line = block.lines[lineIndex];
  const bold = isHeadingKind(block.kind);
  const italic = block.kind === "blockquote";
  const indentMm =
    (lineIndex === 0 ? (block.firstLineIndentMm ?? 0) : 0) +
    (lineIndex < (block.dropCapLines ?? 3) ? (block.dropCapIndentMm ?? 0) : 0);
  const widthMm = Math.max(0, textWidthMm - indentMm);
  const segments = line?.segments?.length ? line.segments : [{ text: line?.text ?? "" }];
  const naturalWidthMm = segments.reduce((sum, segment) => {
    const sizePt =
      block.style.fontSizePt * (segment.marks?.superscript || segment.marks?.subscript ? 0.72 : 1);
    const fontFamily = segment.marks?.code ? "monospace" : block.style.fontFamily;

    return (
      sum +
      measureTextMm(segment.text, {
        fontFamily,
        fontSizePt: sizePt,
        letterSpacingPt: block.style.letterSpacingPt,
        uppercase: block.style.uppercase,
        bold: bold || segment.marks?.bold === true,
        italic: italic || segment.marks?.italic === true,
        ...(measure ? { measure } : {}),
      })
    );
  }, 0);

  let xMm = leftMm + indentMm;
  let wordSpacingPt = 0;

  if (block.style.alignment === "center") {
    xMm += Math.max(0, (widthMm - naturalWidthMm) / 2);
  } else if (block.style.alignment === "right") {
    xMm += Math.max(0, widthMm - naturalWidthMm);
  } else if (block.style.alignment === "justify" && lineIndex < block.lines.length - 1) {
    const spaces = segments.reduce(
      (count, segment) => count + (segment.text.match(/ /gu)?.length ?? 0),
      0,
    );

    if (spaces > 0) {
      wordSpacingPt = (Math.max(0, widthMm - naturalWidthMm) / spaces) * (72 / 25.4);
    }
  }

  return { xMm, widthMm, naturalWidthMm, wordSpacingPt, bold };
}
