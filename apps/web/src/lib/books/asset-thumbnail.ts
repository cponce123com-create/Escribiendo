import { withCloudinaryTransformation } from "@/lib/covers/cloudinary-url";

/**
 * Recuadro de la miniatura: 160 × 80 px en pantalla, pedidos al doble para
 * pantallas de alta densidad. El recorte lo decide Cloudinary con `g_auto`.
 */
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 240;

/**
 * URL de la miniatura de la biblioteca de imágenes.
 *
 * La dirección guardada es siempre la original: la transformación se pide al
 * vuelo. El `src` del documento no se toca porque la exportación incrusta la
 * imagen a resolución completa desde ese mismo valor.
 */
export function bookAssetThumbnailUrl(url: string): string {
  return withCloudinaryTransformation(
    url,
    `c_fill,g_auto,w_${THUMBNAIL_WIDTH},h_${THUMBNAIL_HEIGHT}/f_auto,q_auto:good`,
  );
}
