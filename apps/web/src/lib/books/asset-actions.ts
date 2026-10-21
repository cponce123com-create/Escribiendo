"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCloudinaryConfig } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";
import type { BookAssetSummary } from "@/lib/books/assets";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";

/**
 * Registro de una imagen ya subida a Cloudinary.
 *
 * El navegador no es una fuente de confianza: la URL, el formato, las
 * dimensiones y la carpeta se validan otra vez aquí. La carpeta incluye el
 * espacio de trabajo y el libro, de modo que un identificador ajeno no se
 * pueda reutilizar para enlazar una imagen con otro manuscrito.
 */

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_SIDE = 12_000;
const ALLOWED_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);

const inputSchema = z.object({
  bookId: z.string().uuid("El libro no es válido."),
  publicId: z.string().min(1).max(512),
  secureUrl: z.string().url("La dirección de la imagen no es válida."),
  format: z.string().min(1).max(20),
  width: z.number().int().positive().max(MAX_IMAGE_SIDE),
  height: z.number().int().positive().max(MAX_IMAGE_SIDE),
  bytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
  caption: z.string().max(300).optional(),
  alt: z.string().max(500).optional(),
  originalFilename: z.string().max(255).optional(),
});

export type RegisterBookAssetInput = z.infer<typeof inputSchema>;

export type RegisterBookAssetResult =
  { ok: true; asset: BookAssetSummary } | { ok: false; message: string };

function cloudinaryUrlIsValid(secureUrl: string, cloudName: string): boolean {
  try {
    const url = new URL(secureUrl);

    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.startsWith(`/${cloudName}/image/upload/`)
    );
  } catch {
    return false;
  }
}

export async function registerBookAssetAction(
  input: RegisterBookAssetInput,
): Promise<RegisterBookAssetResult> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return { ok: false, message: "No se ha podido validar la solicitud." };
  }

  const session = await getSession();

  if (!session) {
    return { ok: false, message: "La sesión ha caducado. Vuelve a iniciar sesión." };
  }

  if (!canPerform(session.workspace.role, "section:update")) {
    return { ok: false, message: "No tienes permisos para añadir imágenes a este libro." };
  }

  const parsed = inputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Los datos de la imagen no son válidos." };
  }

  const format = parsed.data.format.toLowerCase();

  if (!ALLOWED_FORMATS.has(format)) {
    return { ok: false, message: "El formato de la imagen no está permitido." };
  }

  let config;

  try {
    config = getCloudinaryConfig();
  } catch {
    return { ok: false, message: "El almacenamiento gráfico no está disponible." };
  }

  if (!config) {
    return { ok: false, message: "Cloudinary no está configurado en este entorno." };
  }

  if (!cloudinaryUrlIsValid(parsed.data.secureUrl, config.cloudName)) {
    return { ok: false, message: "La imagen no pertenece a la cuenta de Cloudinary configurada." };
  }

  const prefix = `${config.uploadFolder}/workspaces/${session.workspace.id}/books/${parsed.data.bookId}/interior/`;

  if (!parsed.data.publicId.startsWith(prefix)) {
    return { ok: false, message: "La imagen no pertenece a la carpeta de este libro." };
  }

  const book = await getBook(session, parsed.data.bookId);

  if (!book) {
    return { ok: false, message: "El libro no existe en este espacio de trabajo." };
  }

  try {
    const previous = await prisma.asset.findUnique({
      where: { publicId: parsed.data.publicId },
      select: { workspaceId: true },
    });

    if (previous && previous.workspaceId !== session.workspace.id) {
      return { ok: false, message: "La imagen pertenece a otro espacio de trabajo." };
    }

    const metadata = parsed.data.alt ? { alt: parsed.data.alt } : {};
    const asset = await prisma.asset.upsert({
      where: { publicId: parsed.data.publicId },
      create: {
        workspaceId: session.workspace.id,
        createdById: session.user.id,
        publicId: parsed.data.publicId,
        secureUrl: parsed.data.secureUrl,
        format,
        width: parsed.data.width,
        height: parsed.data.height,
        bytes: parsed.data.bytes,
        originalFilename: parsed.data.originalFilename ?? null,
        metadata,
      },
      update: {
        secureUrl: parsed.data.secureUrl,
        format,
        width: parsed.data.width,
        height: parsed.data.height,
        bytes: parsed.data.bytes,
        originalFilename: parsed.data.originalFilename ?? null,
        metadata,
        deletedAt: null,
      },
    });

    const sortOrder = await prisma.bookAsset.count({
      where: { bookId: parsed.data.bookId, kind: "INTERIOR_IMAGE" },
    });
    const link = await prisma.bookAsset.upsert({
      where: {
        bookId_assetId_kind: {
          bookId: parsed.data.bookId,
          assetId: asset.id,
          kind: "INTERIOR_IMAGE",
        },
      },
      create: {
        bookId: parsed.data.bookId,
        assetId: asset.id,
        kind: "INTERIOR_IMAGE",
        caption: parsed.data.caption ?? null,
        sortOrder,
      },
      update: {
        caption: parsed.data.caption ?? null,
      },
    });

    await writeAuditLog(
      {
        action: "BOOK_ASSET_REGISTERED",
        entityType: "BookAsset",
        entityId: link.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: {
          bookId: parsed.data.bookId,
          format,
          bytes: parsed.data.bytes,
        },
      },
      context,
    );

    revalidatePath(`/books/${parsed.data.bookId}`);

    return {
      ok: true,
      asset: {
        id: link.id,
        assetId: asset.id,
        publicId: asset.publicId,
        url: asset.secureUrl,
        format: asset.format,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        caption: link.caption,
        originalFilename: asset.originalFilename,
        createdAt: link.createdAt.toISOString(),
      },
    };
  } catch (error) {
    logger.error("books.asset_register_error", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return { ok: false, message: "No se ha podido registrar la imagen. Inténtalo de nuevo." };
  }
}
