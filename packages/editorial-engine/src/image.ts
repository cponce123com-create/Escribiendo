import { breakIntoLines, type MeasureOptions } from "./measure";

/**
 * Imagen editorial.
 *
 * La imagen no es un adorno del editor: forma parte del bloque de composición
 * y necesita las mismas decisiones que el texto (ancho, alto, pie y
 * alineación) para que la vista previa y el PDF cuenten lo mismo.
 */

export type ImageAlignment = "left" | "center" | "right";

export interface EditorialImage {
  src?: string;
  alt?: string;
  /** Pie de imagen. Se compone debajo, en cuerpo menor. */
  caption?: string;
  /** Dimensiones naturales de la imagen, en píxeles. */
  widthPx?: number;
  heightPx?: number;
  /** Porcentaje del ancho útil que ocupa la imagen (10–100). */
  widthPercent?: number;
  alignment?: ImageAlignment;
}

export interface ImageLayoutInput {
  textWidthMm: number;
  textHeightMm: number;
  captionFontFamily: MeasureOptions["fontFamily"];
  captionFontSizePt: number;
}

export interface ImageLayout {
  /** Ancho final de la imagen, en milímetros. */
  widthMm: number;
  /** Alto final de la imagen, en milímetros. */
  heightMm: number;
  captionLines: string[];
  captionFontSizePt: number;
  captionLineHeightMm: number;
  captionGapMm: number;
  /** Alto total del bloque, incluido el pie. */
  totalHeightMm: number;
}

export const DEFAULT_IMAGE_WIDTH_PERCENT = 100;
export const MIN_IMAGE_WIDTH_PERCENT = 10;
export const MAX_IMAGE_WIDTH_PERCENT = 100;
export const IMAGE_CAPTION_GAP_MM = 2;
export const IMAGE_CAPTION_SCALE = 0.86;

export function normalizeImageWidthPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_IMAGE_WIDTH_PERCENT;
  }

  return Math.min(MAX_IMAGE_WIDTH_PERCENT, Math.max(MIN_IMAGE_WIDTH_PERCENT, Math.round(parsed)));
}

export function normalizeImageAlignment(value: unknown): ImageAlignment {
  return value === "left" || value === "right" ? value : "center";
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Calcula la caja de una imagen y su pie.
 *
 * Si la imagen no trae dimensiones, se reserva una caja prudente para que no
 * desaparezca ni desborde la página. Si las trae, se respeta la proporción y
 * se reduce el conjunto cuando no cabe en el área de texto.
 */
export function computeImageLayout(
  image: EditorialImage | undefined,
  input: ImageLayoutInput,
): ImageLayout {
  const textWidthMm = Math.max(10, input.textWidthMm);
  const textHeightMm = Math.max(10, input.textHeightMm);
  const widthPercent = normalizeImageWidthPercent(image?.widthPercent);
  const naturalWidth = positiveNumber(image?.widthPx);
  const naturalHeight = positiveNumber(image?.heightPx);

  let widthMm = textWidthMm * (widthPercent / 100);
  let heightMm =
    naturalWidth && naturalHeight
      ? widthMm * (naturalHeight / naturalWidth)
      : Math.min(textHeightMm * 0.4, 80);

  const maxImageHeightMm = Math.max(12, textHeightMm - IMAGE_CAPTION_GAP_MM - 6);

  if (heightMm > maxImageHeightMm) {
    const scale = maxImageHeightMm / heightMm;
    heightMm = maxImageHeightMm;
    widthMm *= scale;
  }

  const captionFontSizePt = Math.max(6, input.captionFontSizePt);
  const captionLineHeightMm = (captionFontSizePt * 1.3 * 25.4) / 72;
  const caption = image?.caption?.trim() ?? "";
  const captionLines =
    caption.length > 0
      ? breakIntoLines(caption, {
          fontFamily: input.captionFontFamily,
          fontSizePt: captionFontSizePt,
          lineWidthMm: widthMm,
          hyphenation: false,
        }).map((line) => line.text)
      : [];

  const captionHeightMm =
    captionLines.length > 0 ? IMAGE_CAPTION_GAP_MM + captionLines.length * captionLineHeightMm : 0;

  // Si el pie empuja el bloque fuera de la página, se reduce la imagen, no se
  // recorta el pie ni se deja el bloque desbordado.
  const availableImageHeightMm = Math.max(8, textHeightMm - captionHeightMm - IMAGE_CAPTION_GAP_MM);

  if (heightMm > availableImageHeightMm) {
    const scale = availableImageHeightMm / heightMm;
    heightMm = availableImageHeightMm;
    widthMm *= scale;
  }

  return {
    widthMm,
    heightMm,
    captionLines,
    captionFontSizePt,
    captionLineHeightMm,
    captionGapMm: IMAGE_CAPTION_GAP_MM,
    totalHeightMm: heightMm + captionHeightMm,
  };
}
