import { DIGITAL_COVER } from "./print-layout";

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Rectángulo de recorte en píxeles de la imagen original. */
export interface CoverCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FocalCropInput {
  image: ImageDimensions;
  aspect?: number;
  /** 1 = encuadre más amplio; valores mayores acercan. */
  zoom?: number;
  /** Centro del encuadre, normalizado entre 0 y 1. */
  focusX?: number;
  focusY?: number;
}

export interface FocalCropResult {
  crop: CoverCrop;
  focusX: number;
  focusY: number;
  zoom: number;
  aspect: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const COVER_ASPECT = DIGITAL_COVER.aspect;

export function normalizeFocus(value: number, fallback = 0.5): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

export function clampZoom(value: number, min = 1, max = 4): number {
  return Number.isFinite(value) ? clamp(value, min, max) : min;
}

export function largestCropForAspect(
  image: ImageDimensions,
  aspect: number = COVER_ASPECT,
): { width: number; height: number } {
  const width = Math.max(1, image.width);
  const height = Math.max(1, image.height);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : COVER_ASPECT;

  if (width / height > safeAspect) {
    return { width: height * safeAspect, height };
  }

  return { width, height: width / safeAspect };
}

/**
 * Convierte zoom + punto focal en un recorte real de la imagen.
 * El recorte siempre cabe dentro de los límites originales.
 */
export function computeFocalCrop(input: FocalCropInput): FocalCropResult {
  const image = {
    width: Math.max(1, Math.round(input.image.width)),
    height: Math.max(1, Math.round(input.image.height)),
  };
  const aspect =
    Number.isFinite(input.aspect) && (input.aspect ?? 0) > 0
      ? (input.aspect as number)
      : COVER_ASPECT;
  const zoom = clampZoom(input.zoom ?? 1);
  const focusX = normalizeFocus(input.focusX ?? 0.5);
  const focusY = normalizeFocus(input.focusY ?? 0.5);
  const base = largestCropForAspect(image, aspect);
  const cropWidth = Math.max(1, Math.min(image.width, base.width / zoom));
  const cropHeight = Math.max(1, Math.min(image.height, cropWidth / aspect));
  const maxX = Math.max(0, image.width - cropWidth);
  const maxY = Math.max(0, image.height - cropHeight);
  const x = clamp(focusX * image.width - cropWidth / 2, 0, maxX);
  const y = clamp(focusY * image.height - cropHeight / 2, 0, maxY);

  return {
    crop: {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    },
    focusX,
    focusY,
    zoom,
    aspect,
  };
}

export function clampCropRect(crop: CoverCrop, image: ImageDimensions): CoverCrop {
  const imageWidth = Math.max(1, Math.round(image.width));
  const imageHeight = Math.max(1, Math.round(image.height));
  const width = clamp(Math.round(crop.width), 1, imageWidth);
  const height = clamp(Math.round(crop.height), 1, imageHeight);
  const x = clamp(Math.round(crop.x), 0, Math.max(0, imageWidth - width));
  const y = clamp(Math.round(crop.y), 0, Math.max(0, imageHeight - height));

  return { x, y, width, height };
}

export function isValidCropRect(crop: CoverCrop, image: ImageDimensions): boolean {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) return false;
  if (crop.width < 1 || crop.height < 1) return false;
  if (crop.x < 0 || crop.y < 0) return false;

  return crop.x + crop.width <= image.width + 1 && crop.y + crop.height <= image.height + 1;
}

/**
 * Reconstruye el estado de la interfaz a partir de un recorte guardado.
 * Sirve para reabrir una portada y seguir ajustando el encuadre.
 */
export function cropToFocalState(
  crop: CoverCrop,
  image: ImageDimensions,
): { focusX: number; focusY: number; zoom: number } {
  const base = largestCropForAspect(image);
  const safeCrop = clampCropRect(crop, image);
  const zoom = clampZoom(Math.max(1, base.width / Math.max(1, safeCrop.width)));
  const focusX = normalizeFocus((safeCrop.x + safeCrop.width / 2) / Math.max(1, image.width));
  const focusY = normalizeFocus((safeCrop.y + safeCrop.height / 2) / Math.max(1, image.height));

  return { focusX, focusY, zoom };
}

export function isFullImageCrop(crop: CoverCrop, image: ImageDimensions): boolean {
  return (
    crop.x <= 1 &&
    crop.y <= 1 &&
    Math.abs(crop.width - image.width) <= 1 &&
    Math.abs(crop.height - image.height) <= 1
  );
}

/** Proporción que ocupa el recorte dentro de la imagen, útil para la previsualización CSS. */
export function cropToPercentages(
  crop: CoverCrop,
  image: ImageDimensions,
): { left: number; top: number; width: number; height: number } {
  const safe = clampCropRect(crop, image);
  return {
    left: (safe.x / image.width) * 100,
    top: (safe.y / image.height) * 100,
    width: (safe.width / image.width) * 100,
    height: (safe.height / image.height) * 100,
  };
}
