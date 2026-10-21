import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudinaryConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { assertRequestOrigin } from "@/lib/security/request-context";
import { AppError } from "@/lib/errors";
import { buildCloudinarySignature } from "@/lib/cloudinary/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_FORMATS = "jpg,jpeg,png,webp,avif";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertRequestOrigin(request);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 403;
    return NextResponse.json({ error: "Origen no autorizado." }, { status });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const rateLimit = consumeRateLimit({
    scope: "cloudinary-signature",
    identifier: session.user.id,
    limit: 30,
    windowMs: 60 * 60 * 1_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera antes de volver a intentarlo." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  let config;

  try {
    config = getCloudinaryConfig();
  } catch {
    logger.error("cloudinary.config_invalid", { requestId: request.headers.get("x-request-id") });
    return NextResponse.json(
      { error: "El almacenamiento gráfico no está disponible." },
      { status: 503 },
    );
  }

  if (!config) {
    return NextResponse.json(
      { error: "Cloudinary no está configurado en este entorno." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const requestSchema = z.object({
    purpose: z.enum(["cover", "interior"]).default("cover"),
    bookId: z.string().uuid().optional(),
  });
  const parsed = requestSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
  }

  if (parsed.data.purpose === "interior") {
    if (!parsed.data.bookId) {
      return NextResponse.json({ error: "Falta el libro de destino." }, { status: 400 });
    }

    const book = await getBook(session, parsed.data.bookId);

    if (!book) {
      return NextResponse.json(
        { error: "El libro no existe en este espacio de trabajo." },
        { status: 404 },
      );
    }
  }

  // Firmar una subida es escribir en el espacio de trabajo: lo que se puede
  // subir depende del rol, también para las portadas.
  if (!canPerform(session.workspace.role, "section:update")) {
    return NextResponse.json({ error: "No tienes permisos para subir imágenes." }, { status: 403 });
  }

  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const folder =
    parsed.data.purpose === "interior" && parsed.data.bookId
      ? `${config.uploadFolder}/workspaces/${session.workspace.id}/books/${parsed.data.bookId}/interior`
      : `${config.uploadFolder}/workspaces/${session.workspace.id}/covers`;
  const params = {
    timestamp,
    folder,
    allowed_formats: ALLOWED_IMAGE_FORMATS,
    unique_filename: "true",
  };
  const signature = buildCloudinarySignature(params, config.apiSecret);

  return NextResponse.json(
    {
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      signature,
      params,
      purpose: parsed.data.purpose,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
