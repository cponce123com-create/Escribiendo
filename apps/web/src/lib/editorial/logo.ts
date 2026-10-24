import "server-only";
import { cache } from "react";
import type { EditorialImage } from "@escribiendo/editorial-engine";
import { isAllowedImageSource, loadExportImages } from "@/lib/export/images";

/**
 * Resolución del logotipo editorial de las materias.
 *
 * Solo se descargan URLs de la cuenta de Cloudinary configurada, con los
 * mismos límites de tamaño y tiempo que las imágenes del manuscrito. Una URL
 * ajena se omite sin hacer peticiones: el servidor no debe convertirse en un
 * proxy hacia redes privadas (SSRF).
 */
const LOGO_WIDTH_PERCENT = 25;

export const loadMatterLogo = cache(
  async (url: string | null | undefined): Promise<EditorialImage | null> => {
    const src = url?.trim();

    if (!src || !isAllowedImageSource(src)) {
      return null;
    }

    const { assets } = await loadExportImages({ sources: [src], target: "pdf" });
    const asset = assets.get(src);

    if (!asset) {
      return null;
    }

    return {
      src,
      alt: "Logotipo editorial",
      widthPx: asset.width,
      heightPx: asset.height,
      widthPercent: LOGO_WIDTH_PERCENT,
      alignment: "center",
    };
  },
);

/** Adjunta el logotipo resuelto a la materia, sin mutar el objeto original. */
export async function attachMatterLogo<T extends { legal?: { logoUrl?: string | null } | null }>(
  matter: T,
): Promise<T & { logoImage?: EditorialImage }> {
  const logoImage = await loadMatterLogo(matter.legal?.logoUrl);

  return logoImage ? { ...matter, logoImage } : matter;
}
