import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";

/**
 * Biblioteca gráfica de un libro.
 *
 * La consulta filtra por el espacio de trabajo de la sesión y por el libro:
 * conocer el identificador de otro estudio no basta para leer sus imágenes.
 */
export interface BookAssetSummary {
  id: string;
  assetId: string;
  publicId: string;
  url: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  caption: string | null;
  originalFilename: string | null;
  createdAt: string;
}

export async function listBookAssets(
  session: SessionContext,
  bookId: string,
): Promise<BookAssetSummary[]> {
  const links = await prisma.bookAsset.findMany({
    where: {
      bookId,
      kind: "INTERIOR_IMAGE",
      book: { workspaceId: session.workspace.id, deletedAt: null },
      asset: { deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      assetId: true,
      caption: true,
      createdAt: true,
      asset: {
        select: {
          publicId: true,
          secureUrl: true,
          format: true,
          width: true,
          height: true,
          bytes: true,
          originalFilename: true,
        },
      },
    },
  });

  return links.map((link) => ({
    id: link.id,
    assetId: link.assetId,
    publicId: link.asset.publicId,
    url: link.asset.secureUrl,
    format: link.asset.format,
    width: link.asset.width,
    height: link.asset.height,
    bytes: link.asset.bytes,
    caption: link.caption,
    originalFilename: link.asset.originalFilename,
    createdAt: link.createdAt.toISOString(),
  }));
}
