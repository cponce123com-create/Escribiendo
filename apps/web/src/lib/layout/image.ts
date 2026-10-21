import type { TiptapNode } from "@escribiendo/book-schema";
import {
  normalizeImageAlignment,
  normalizeImageWidthPercent,
  type EditorialImage,
} from "@escribiendo/editorial-engine";

/**
 * Lectura de una imagen de Tiptap.
 *
 * Se comparte entre la vista previa y la exportación para que ambas rutas
 * interpreten los mismos atributos. La URL se limita a HTTP(S): una imagen no
 * puede introducir `javascript:` ni un `data:` gigantesco en el manuscrito.
 */

function textAttribute(node: TiptapNode, name: string): string {
  const value = node.attrs?.[name];

  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

export function safeImageSource(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Convierte los atributos del nodo `image` en el modelo editorial común. */
export function editorialImageFromNode(node: TiptapNode): EditorialImage {
  const src = safeImageSource(node.attrs?.src);
  const alt = textAttribute(node, "alt");
  const caption = textAttribute(node, "caption");
  const widthPx = positiveInteger(node.attrs?.widthPx);
  const heightPx = positiveInteger(node.attrs?.heightPx);

  return {
    ...(src ? { src } : {}),
    ...(alt ? { alt } : {}),
    ...(caption ? { caption } : {}),
    ...(widthPx ? { widthPx } : {}),
    ...(heightPx ? { heightPx } : {}),
    widthPercent: normalizeImageWidthPercent(node.attrs?.widthPercent),
    alignment: normalizeImageAlignment(node.attrs?.alignment),
  };
}
