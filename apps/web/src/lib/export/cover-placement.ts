/**
 * Geometría de la portada dentro de la página.
 *
 * La imagen se escala de forma uniforme hasta cubrir la hoja —nunca se
 * deforma— y el punto focal elige qué parte queda a la vista. La vista previa
 * usa esta misma geometría con CSS (`object-fit: cover`, `object-position` y
 * `scale`), de modo que pantalla y PDF enseñan el mismo recorte.
 */
export interface CoverPlacement {
  xMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
}

export interface CoverCropGeometry {
  /** Centro horizontal, de 0 a 100. */
  x: number;
  /** Centro vertical, de 0 a 100. */
  y: number;
  /** Ampliación, de 1 a 3. */
  zoom: number;
}

const DEFAULT_CROP: CoverCropGeometry = { x: 50, y: 50, zoom: 1 };

/** Calcula el rectángulo que ocupa la portada dentro de la página. */
export function coverPlacement(
  pageWidthMm: number,
  pageHeightMm: number,
  imageWidthPx: number,
  imageHeightPx: number,
  crop: CoverCropGeometry = DEFAULT_CROP,
): CoverPlacement {
  const imageWidth = Math.max(1, imageWidthPx);
  const imageHeight = Math.max(1, imageHeightPx);
  const pageWidth = Math.max(1, pageWidthMm);
  const pageHeight = Math.max(1, pageHeightMm);
  const zoom = Math.min(3, Math.max(1, crop.zoom));
  // `cover`: la imagen cubre la página por el lado que más se estrecha.
  const baseScale =
    imageWidth / imageHeight > pageWidth / pageHeight
      ? pageHeight / imageHeight
      : pageWidth / imageWidth;
  const widthMm = imageWidth * baseScale * zoom;
  const heightMm = imageHeight * baseScale * zoom;
  const focusX = Math.min(100, Math.max(0, crop.x)) / 100;
  const focusY = Math.min(100, Math.max(0, crop.y)) / 100;

  return {
    // El punto focal de la imagen queda sobre el mismo punto de la página.
    xMm: focusX * (pageWidth - widthMm),
    topMm: focusY * (pageHeight - heightMm),
    widthMm,
    heightMm,
  };
}
