"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { errorState, formValue } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { assertCanPerform } from "@/lib/books/permissions";
import { requestExport } from "@/lib/export/jobs";
import { downloadExpiry, signDownload } from "@/lib/export/signature";

/**
 * Petición de exportación.
 *
 * El trabajo se genera en el momento: no hay cola que vaciar en segundo
 * plano ni proceso permanente que la consuma. La descarga va firmada y
 * caduca a los pocos minutos.
 */

const formatSchema = z.enum(["PDF_DIGITAL", "PDF_PRINT", "EPUB3", "DOCX"]);

const uuidSchema = z.string().uuid("El identificador no es válido.");

export interface ExportActionState extends ActionState {
  /** Dirección de descarga firmada, cuando la exportación ha funcionado. */
  downloadUrl?: string;
  /** Identificador del trabajo, para mostrar su estado. */
  jobId?: string;
  /** Metadatos del archivo generado. */
  metadata?: {
    bytes: number;
    sha256: string;
    pageCount: number | null;
    wordCount: number;
    fileName: string | null;
    /** Caracteres que el archivo no ha podido representar. */
    caracteresPerdidos: string[];
  };
}

export async function requestExportAction(
  _previousState: ExportActionState,
  formData: FormData,
): Promise<ExportActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "export:create");
  } catch {
    return errorState("No tienes permisos para exportar en este espacio de trabajo.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));
  const format = formatSchema.safeParse(formValue(formData, "format"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  if (!format.success) {
    return errorState("El formato de exportación no es válido.");
  }

  let job;

  try {
    job = await requestExport(session, bookId.data, format.data);
  } catch (error) {
    logger.error("export.request_error", {
      requestId: context?.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return errorState(
      error instanceof Error ? error.message : "No se ha podido generar el archivo de exportación.",
    );
  }

  await writeAuditLog(
    {
      action: "EXPORT_REQUESTED",
      entityType: "ExportJob",
      entityId: job.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { format: job.format, bookId: job.bookId },
    },
    context,
  );

  const expiresAt = downloadExpiry();
  const signature = signDownload({
    jobId: job.id,
    userId: session.user.id,
    expiresAt,
  });

  revalidatePath(`/books/${job.bookId}/export`);

  return {
    status: "success",
    message: "Archivo generado. La descarga caduca en unos minutos.",
    downloadUrl: `/api/exports/${job.id}/download?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`,
    jobId: job.id,
    metadata: job.metadata
      ? {
          bytes: job.metadata.bytes,
          sha256: job.metadata.sha256,
          pageCount: job.metadata.pageCount,
          wordCount: job.metadata.wordCount,
          fileName: job.fileName,
          caracteresPerdidos: job.metadata.caracteresPerdidos ?? [],
        }
      : undefined,
  };
}
