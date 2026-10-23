import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { DEFAULT_CROP, type BookCoverSummary, type CoverCrop } from "./cover-shared";

function readCrop(metadata: unknown): CoverCrop {
  if (!metadata || typeof metadata !== "object") {
    return DEFAULT_CROP;
  }

  const value = metadata as Record<string, unknown>;
  const x = typeof value.cropX === "number" ? value.cropX : DEFAULT_CROP.x;
  const y = typeof value.cropY === "number" ? value.cropY : DEFAULT_CROP.y;
  const zoom = typeof value.cropZoom === "number" ? value.cropZoom : DEFAULT_CROP.zoom;

  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    zoom: Math.min(3, Math.max(1, zoom)),
  };
}

function mapCover(link: {
  id: string;
  assetId: string;
  createdAt: Date;
  asset: {
    secureUrl: string;
    format: string;
    width: number | null;
    height: number | null;
    bytes: number | null;
    originalFilename: string | null;
    metadata: unknown;
  };
}): BookCoverSummary {
  return {
    id: link.id,
    assetId: link.assetId,
    url: link.asset.secureUrl,
    format: link.asset.format,
    width: link.asset.width,
    height: link.asset.height,
    bytes: link.asset.bytes,
    originalFilename: link.asset.originalFilename,
    createdAt: link.createdAt.toISOString(),
    crop: readCrop(link.asset.metadata),
  };
}

/** Devuelve la última portada no eliminada del libro. */
export async function getBookCover(
  session: SessionContext,
  bookId: string,
): Promise<BookCoverSummary | null> {
  const cover = await prisma.bookAsset.findFirst({
    where: {
      bookId,
      kind: "COVER_FRONT",
      book: { workspaceId: session.workspace.id, deletedAt: null },
      asset: { deletedAt: null },
    },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      assetId: true,
      createdAt: true,
      asset: {
        select: {
          secureUrl: true,
          format: true,
          width: true,
          height: true,
          bytes: true,
          originalFilename: true,
          metadata: true,
        },
      },
    },
  });

  return cover ? mapCover(cover) : null;
}

/** Obtiene portadas para varias obras sin permitir acceso entre espacios. */
export async function getBookCovers(
  session: SessionContext,
  bookIds: readonly string[],
): Promise<Map<string, BookCoverSummary>> {
  if (bookIds.length === 0) {
    return new Map();
  }

  const links = await prisma.bookAsset.findMany({
    where: {
      bookId: { in: [...bookIds] },
      kind: "COVER_FRONT",
      book: { workspaceId: session.workspace.id, deletedAt: null },
      asset: { deletedAt: null },
    },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: {
      bookId: true,
      id: true,
      assetId: true,
      createdAt: true,
      asset: {
        select: {
          secureUrl: true,
          format: true,
          width: true,
          height: true,
          bytes: true,
          originalFilename: true,
          metadata: true,
        },
      },
    },
  });

  const covers = new Map<string, BookCoverSummary>();
  for (const link of links) {
    if (!covers.has(link.bookId)) {
      covers.set(link.bookId, mapCover(link));
    }
  }
  return covers;
}

export function coverObjectPosition(crop: CoverCrop): string {
  return `${crop.x}% ${crop.y}%`;
}

export { DEFAULT_CROP } from "./cover-shared";
export type { BookCoverSummary, CoverCrop } from "./cover-shared";
