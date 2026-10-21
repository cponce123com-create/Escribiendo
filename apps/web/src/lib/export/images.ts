import "server-only";
import {
  prepareImageAsset,
  type ExportImageAsset,
  type ExportImageMap,
  type ImageTarget,
} from "@escribiendo/export-engine";
import { getCloudinaryConfig } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Resolución de imágenes para un archivo de exportación.
 *
 * Solo se descargan URLs de la cuenta de Cloudinary configurada. Un manuscrito
 * podría contener una URL arbitraria; descargarla desde el servidor sería una
 * puerta abierta a SSRF. Las imágenes no permitidas se omiten y el exportador
 * deja un marcador visible, nunca las elimina en silencio.
 */

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 80;
const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;

export function isAllowedImageSource(src: string): boolean {
  try {
    const url = new URL(src);

    if (url.protocol !== "https:") {
      return false;
    }

    const config = getCloudinaryConfig();

    if (!config) {
      return false;
    }

    return (
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${config.cloudName}/image/upload/`)
    );
  } catch {
    return false;
  }
}

async function fetchImageBytes(src: string): Promise<Uint8Array | null> {
  if (!isAllowedImageSource(src)) {
    return null;
  }

  try {
    const response = await fetch(src, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: { "User-Agent": "ESCRIBIENDO/1.0" },
    });

    if (!response.ok) {
      return null;
    }

    // Una redirección podría llevar a un host no autorizado: se comprueba la
    // URL final, no solo la de partida.
    if (!isAllowedImageSource(response.url)) {
      return null;
    }

    const declaredSize = Number(response.headers.get("content-length") ?? "0");

    if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
      return null;
    }

    const buffer = new Uint8Array(await response.arrayBuffer());

    return buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
  } catch (error) {
    logger.warn("export.image_fetch_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return null;
  }
}

export interface LoadedExportImages {
  assets: Map<string, ExportImageAsset>;
  /** URLs que no se han podido resolver. */
  omitted: string[];
}

export async function loadExportImages(input: {
  sources: readonly string[];
  target: ImageTarget;
  provided?: ExportImageMap;
}): Promise<LoadedExportImages> {
  const assets = new Map<string, ExportImageAsset>(input.provided ?? []);
  const omitted: string[] = [];
  const allPending = [...new Set(input.sources)].filter(
    (src) => src.length > 0 && !assets.has(src),
  );
  const pending = allPending.slice(0, MAX_IMAGES);

  if (pending.length === 0) {
    return { assets, omitted };
  }

  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const src = pending[index];

      if (!src) {
        continue;
      }

      const bytes = await fetchImageBytes(src);

      if (!bytes) {
        omitted.push(src);
        continue;
      }

      const prepared = await prepareImageAsset(bytes, input.target);

      if (!prepared) {
        omitted.push(src);
        continue;
      }

      assets.set(src, prepared);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));

  // Las URLs que superan el límite tampoco se resuelven.
  omitted.push(...allPending.slice(MAX_IMAGES));

  return { assets, omitted };
}
