import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { exportContext, generateFile } from "@/lib/export/generate";
import { loadManuscript, type SectionVersion } from "@/lib/export/manuscript";
import { verifyDownload } from "@/lib/export/signature";

/**
 * Descarga de un archivo de exportación.
 *
 * El archivo **no se guarda**: se genera aquí, a partir de las versiones del
 * manuscrito que guardó el trabajo. Como las revisiones son inmutables, el
 * resultado es el mismo que se descargó la primera vez, byte a byte.
 *
 * La descarga exige sesión y una firma de corta duración: la dirección
 * caduca y no sirve para siempre.
 */

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "No hay sesión." }, { status: 401 });
  }

  const { jobId } = await context.params;
  const url = new URL(request.url);
  const signature = url.searchParams.get("signature") ?? "";
  const expires = Number(url.searchParams.get("expires") ?? "0");

  if (!verifyDownload(signature, { jobId, userId: session.user.id, expiresAt: expires })) {
    return NextResponse.json(
      { error: "La descarga ha caducado o la dirección no es válida." },
      { status: 403 },
    );
  }

  const job = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: {
      id: true,
      bookId: true,
      format: true,
      status: true,
      sectionVersions: true,
      createdAt: true,
      options: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "El trabajo no existe." }, { status: 404 });
  }

  try {
    const book = await prisma.book.findFirst({
      where: { id: job.bookId, workspaceId: session.workspace.id, deletedAt: null },
      select: { title: true, authorName: true },
    });

    if (!book) {
      return NextResponse.json({ error: "El libro no existe." }, { status: 404 });
    }

    const versions = (job.sectionVersions ?? []) as unknown as SectionVersion[];
    const sections = await loadManuscript(session, job.bookId, versions);
    const contextData = await exportContext(session, job.bookId);

    const file = generateFile({
      format: job.format,
      title: book.title,
      author: book.authorName,
      sections,
      profile: contextData.profile,
      typography: contextData.typography,
      createdAt: job.createdAt,
    });

    const options = (job.options ?? {}) as { fileName?: string; mimeType?: string };

    return new NextResponse(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": options.mimeType ?? file.mimeType,
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": `attachment; filename="${options.fileName ?? file.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("export.download_error", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json(
      { error: "No se ha podido generar el archivo de exportación." },
      { status: 500 },
    );
  }
}
