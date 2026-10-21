import sharp from "sharp";
import type { ExportImageAsset } from "./assets";

/**
 * Normalización de imágenes para exportación.
 *
 * PDF solo entiende de forma directa JPEG, así que toda imagen se convierte a
 * JPEG RGB con fondo blanco. EPUB y DOCX admiten PNG; se conserva la
 * transparencia cuando existe. El tamaño se limita para proteger la memoria de
 * Render Free, sin ampliar las imágenes pequeñas.
 */

export type ImageTarget = "pdf" | "epub" | "docx";

const MAX_SIDE_PX = 2_400;
const JPEG_QUALITY = 90;

export async function prepareImageAsset(
  input: Uint8Array,
  target: ImageTarget,
): Promise<ExportImageAsset | null> {
  if (input.length === 0) {
    return null;
  }

  try {
    const metadata = await sharp(input, { failOn: "error" }).metadata();
    const hasAlpha = metadata.hasAlpha === true;
    const pipeline = sharp(input, { failOn: "error" }).rotate().resize({
      width: MAX_SIDE_PX,
      height: MAX_SIDE_PX,
      fit: "inside",
      withoutEnlargement: true,
    });

    if (target === "pdf" || !hasAlpha) {
      const { data, info } = await pipeline
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
        .toBuffer({ resolveWithObject: true });

      return {
        data: new Uint8Array(data),
        mimeType: "image/jpeg",
        extension: "jpg",
        width: info.width,
        height: info.height,
      };
    }

    const { data, info } = await pipeline
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });

    return {
      data: new Uint8Array(data),
      mimeType: "image/png",
      extension: "png",
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
}
