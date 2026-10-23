import type { CoverCrop } from "./geometry";
import { DIGITAL_COVER } from "./print-layout";

export interface CoverUrlOptions {
  crop?: CoverCrop | null;
  width?: number;
  height?: number;
  /** Las exportaciones usan JPG para que el lector no tenga que interpretar WebP. */
  format?: "auto" | "jpg";
  quality?: string;
}

const clampDimension = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value) || (value ?? 0) < 1) return fallback;
  return Math.min(12_000, Math.round(value as number));
};

const isCloudinaryUrl = (url: string): boolean => /^https:\/\/res\.cloudinary\.com\//i.test(url);

/**
 * Inserta una transformación en una URL de Cloudinary sin tocar el public_id.
 * Se guarda siempre la URL original de subida y se generan las variantes al
 * vuelo; así el recorte se puede rehacer sin volver a subir la imagen.
 */
export function withCloudinaryTransformation(url: string, transformation: string): string {
  if (!url || !isCloudinaryUrl(url)) return url;

  const cleanUrl = url.split("?")[0] ?? url;
  const marker = "/image/upload/";
  const index = cleanUrl.indexOf(marker);

  if (index === -1) return cleanUrl;

  const prefix = cleanUrl.slice(0, index + marker.length);
  const suffix = cleanUrl.slice(index + marker.length);

  if (!transformation) return cleanUrl;

  return `${prefix}${transformation}/${suffix}`;
}

/**
 * URL de la portada recortada. Si no hay recorte guardado, Cloudinary hace un
 * relleno centrado con la proporción editorial 1:1,6.
 */
export function cloudinaryCoverUrl(url: string, options: CoverUrlOptions = {}): string {
  if (!url) return "";

  const width = clampDimension(options.width, DIGITAL_COVER.width);
  const height = clampDimension(options.height, DIGITAL_COVER.height);
  const format = options.format ?? "auto";
  const quality = options.quality ?? "auto";

  const crop = options.crop;
  const hasCrop =
    !!crop &&
    [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
    crop.width > 0 &&
    crop.height > 0;

  const pieces: string[] = [];

  if (crop && hasCrop) {
    pieces.push(
      `c_crop,x_${Math.round(crop.x)},y_${Math.round(crop.y)},w_${Math.round(crop.width)},h_${Math.round(crop.height)}`,
    );
    pieces.push(`c_fill,w_${width},h_${height}`);
  } else {
    pieces.push(`c_fill,ar_5:8,w_${width},h_${height}`);
  }

  pieces.push(format === "jpg" ? "f_jpg,q_90" : `f_auto,q_${quality}`);

  return withCloudinaryTransformation(url, pieces.join("/"));
}

/** Imagen original, sin recorte, para «Restaurar original». */
export function cloudinaryOriginalUrl(url: string): string {
  return url ? (url.split("?")[0] ?? url) : "";
}

/**
 * URL rasterizada para incrustar en un PDF. Los PDF no entienden AVIF/WebP de
 * forma fiable, por eso se fuerza JPG. Cloudinary conserva la resolución del
 * recorte y no amplía una imagen menor.
 */
export function cloudinaryPdfCoverUrl(
  url: string,
  crop: CoverCrop | null = null,
  width = DIGITAL_COVER.width,
  height = DIGITAL_COVER.height,
): string {
  return cloudinaryCoverUrl(url, { crop, width, height, format: "jpg", quality: "90" });
}

export function isCloudinarySecureUrl(url: string): boolean {
  return isCloudinaryUrl(url);
}
