"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCloudinaryConfig } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertCanPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import type { LibraryActionState } from "@/lib/books/action-state";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_SIDE = 12_000;
const ALLOWED_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);
const uuidSchema = z.string().uuid("El libro no es válido.");
const cropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(1).max(3),
});
const inputSchema = z.object({
  bookId: uuidSchema,
  publicId: z.string().min(1).max(512),
  secureUrl: z.string().url(),
  format: z.string().min(1).max(20),
  width: z.number().int().positive().max(MAX_IMAGE_SIDE),
  height: z.number().int().positive().max(MAX_IMAGE_SIDE),
  bytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
  originalFilename: z.string().max(255).optional(),
});

function errorState(message: string): LibraryActionState {
  return { status: "error", message };
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

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

async function authorizedBook(bookId: string) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  assertCanPerform(session.workspace.role, "book:update");
  const book = await getBook(session, bookId);
  if (!book) {
    throw new Error("El libro no existe en este espacio de trabajo.");
  }
  return { session, book };
}

function revalidateCover(bookId: string): void {
  revalidatePath("/books");
  revalidatePath("/dashboard");
  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/books/${bookId}/edit`);
}

export type RegisterBookCoverInput = z.infer<typeof inputSchema>;

export async function registerBookCoverAction(
  input: RegisterBookCoverInput,
): Promise<LibraryActionState> {
  let context: RequestContext | undefined;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return errorState("Los datos de la portada no son válidos.");
  }

  let authorized: Awaited<ReturnType<typeof authorizedBook>>;
  try {
    authorized = await authorizedBook(parsed.data.bookId);
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "No tienes permisos para subir portadas.",
    );
  }

  const { session } = authorized;
  const format = parsed.data.format.toLowerCase();
  if (!ALLOWED_FORMATS.has(format)) {
    return errorState("Usa una imagen JPG, PNG o WebP.");
  }

  let config;
  try {
    config = getCloudinaryConfig();
  } catch {
    return errorState("El almacenamiento gráfico no está disponible.");
  }
  if (!config) {
    return errorState("Cloudinary no está configurado en este entorno.");
  }
  if (!cloudinaryUrlIsValid(parsed.data.secureUrl, config.cloudName)) {
    return errorState("La imagen no pertenece a la cuenta de Cloudinary configurada.");
  }

  const prefix = `${config.uploadFolder}/workspaces/${session.workspace.id}/books/${parsed.data.bookId}/cover/`;
  if (!parsed.data.publicId.startsWith(prefix)) {
    return errorState("La imagen no pertenece a la carpeta de este libro.");
  }

  try {
    const asset = await prisma.asset.create({
      data: {
        workspaceId: session.workspace.id,
        createdById: session.user.id,
        publicId: parsed.data.publicId,
        secureUrl: parsed.data.secureUrl,
        format,
        width: parsed.data.width,
        height: parsed.data.height,
        bytes: parsed.data.bytes,
        originalFilename: parsed.data.originalFilename ?? null,
        metadata: { cropX: 50, cropY: 50, cropZoom: 1 },
      },
    });
    const sortOrder = await prisma.bookAsset.count({
      where: { bookId: parsed.data.bookId, kind: "COVER_FRONT" },
    });
    const link = await prisma.bookAsset.create({
      data: {
        bookId: parsed.data.bookId,
        assetId: asset.id,
        kind: "COVER_FRONT",
        sortOrder,
      },
    });
    await writeAuditLog(
      {
        action: "BOOK_COVER_UPLOADED",
        entityType: "BookAsset",
        entityId: link.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, format, bytes: parsed.data.bytes },
      },
      context,
    );
    revalidateCover(parsed.data.bookId);
    return { status: "success", message: "Portada guardada." };
  } catch (error) {
    logger.error("books.cover_register_error", {
      requestId: context?.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorState("No se ha podido guardar la portada. Inténtalo de nuevo.");
  }
}

export async function updateBookCoverCropAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  let context: RequestContext | undefined;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));
  const crop = cropSchema.safeParse({
    x: Number(formValue(formData, "x")),
    y: Number(formValue(formData, "y")),
    zoom: Number(formValue(formData, "zoom")),
  });
  if (!bookId.success || !crop.success) {
    return errorState("El encuadre de la portada no es válido.");
  }

  try {
    const { session } = await authorizedBook(bookId.data);
    const cover = await prisma.bookAsset.findFirst({
      where: {
        bookId: bookId.data,
        kind: "COVER_FRONT",
        book: { workspaceId: session.workspace.id, deletedAt: null },
        asset: { deletedAt: null },
      },
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      select: { assetId: true },
    });
    if (!cover) {
      return errorState("Este libro todavía no tiene portada.");
    }
    await prisma.asset.update({
      where: { id: cover.assetId },
      data: { metadata: { cropX: crop.data.x, cropY: crop.data.y, cropZoom: crop.data.zoom } },
    });
    await writeAuditLog(
      {
        action: "BOOK_COVER_CROP_UPDATED",
        entityType: "Asset",
        entityId: cover.assetId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: bookId.data, ...crop.data },
      },
      context,
    );
    revalidateCover(bookId.data);
    return { status: "success", message: "Encuadre actualizado." };
  } catch (error) {
    logger.error("books.cover_crop_error", {
      requestId: context?.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorState("No se ha podido actualizar el encuadre.");
  }
}

export async function deleteBookCoverAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  let context: RequestContext | undefined;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }
  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));
  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  try {
    const { session } = await authorizedBook(bookId.data);
    const cover = await prisma.bookAsset.findFirst({
      where: {
        bookId: bookId.data,
        kind: "COVER_FRONT",
        book: { workspaceId: session.workspace.id, deletedAt: null },
        asset: { deletedAt: null },
      },
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      select: { assetId: true },
    });
    if (!cover) {
      return errorState("Este libro no tiene portada.");
    }
    await prisma.asset.updateMany({
      where: {
        workspaceId: session.workspace.id,
        deletedAt: null,
        bookLinks: { some: { bookId: bookId.data, kind: "COVER_FRONT" } },
      },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog(
      {
        action: "BOOK_COVER_DELETED",
        entityType: "Asset",
        entityId: cover.assetId,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: bookId.data },
      },
      context,
    );
    revalidateCover(bookId.data);
    return { status: "success", message: "Portada eliminada." };
  } catch (error) {
    logger.error("books.cover_delete_error", {
      requestId: context?.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorState("No se ha podido eliminar la portada.");
  }
}
