/**
 * Imagen ya resuelta para un archivo de exportación.
 *
 * El motor de exportación no descarga ni convierte imágenes: recibe los bytes
 * ya normalizados por la capa de la aplicación. Así el paquete sigue siendo
 * determinista y se puede probar sin red.
 */
export interface ExportImageAsset {
  data: Uint8Array;
  mimeType: string;
  extension: "jpg" | "png";
  width: number;
  height: number;
}

export type ExportImageMap = ReadonlyMap<string, ExportImageAsset>;

/** Punto focal y ampliación con que se recorta una portada. */
export interface ExportImageCrop {
  /** Centro horizontal, de 0 (izquierda) a 100 (derecha). */
  x: number;
  /** Centro vertical, de 0 (arriba) a 100 (abajo). */
  y: number;
  /** Ampliación, de 1 (sin ampliar) a 3. */
  zoom: number;
}

/** Atributos editoriales comunes a EPUB, DOCX y PDF. */
export interface ExportImage {
  src?: string;
  alt?: string;
  caption?: string;
  widthPx?: number;
  heightPx?: number;
  widthPercent?: number;
  alignment?: "left" | "center" | "right";
  /**
   * Recorte editorial de la portada. El EPUB y el DOCX lo ignoran porque
   * refluyen la imagen; el PDF lo aplica al componer la página de cubierta.
   */
  crop?: ExportImageCrop;
}
