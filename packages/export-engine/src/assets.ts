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

/** Atributos editoriales comunes a EPUB, DOCX y PDF. */
export interface ExportImage {
  src?: string;
  alt?: string;
  caption?: string;
  widthPx?: number;
  heightPx?: number;
  widthPercent?: number;
  alignment?: "left" | "center" | "right";
}
