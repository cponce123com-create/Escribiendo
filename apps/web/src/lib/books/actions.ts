"use server";
import { compareEditorialSections } from "./reading-order";
import { withSerializableRetry } from "./serializable";
import { recomputeBookTotals } from "./statistics";
import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  BOOK_SECTION_TYPES,
  bookMetadataSchema,
  countWordsInDocument,
  parseTiptapDocument,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import type { Prisma, RevisionReason } from "@escribiendo/database";
import { firstZodError, zodFieldErrors } from "@escribiendo/shared";
import { prisma } from "@/lib/db";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { assertCanPerform } from "./permissions";
import { canTransitionTo } from "./status";
import type { LibraryActionState } from "./action-state";
import type { SectionSaveState } from "@/lib/editor/sync";

/**
 * Intervalo mínimo entre dos guardados automáticos de la misma sección.
 *
 * El autoguardado existe para no perder trabajo ante un cierre accidental
 * del navegador, no para sustituir al guardado explícito. Acotarlo evita
 * llenar el historial de revisiones de ruido.
 */
const AUTOSAVE_MIN_INTERVAL_MS = 45_000;

const uuidSchema = z.string().uuid("El identificador no es válido.");
const sectionTypeSchema = z.enum(BOOK_SECTION_TYPES);

const bookMetadataFormSchema = bookMetadataSchema.extend({
  targetWordCount: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().int().positive().max(10_000_000).optional(),
  ),
});

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorState(message: string, fieldErrors?: Record<string, string>): LibraryActionState {
  return { status: "error", message, ...(fieldErrors ? { fieldErrors } : {}) };
}

function successState(message: string): LibraryActionState {
  return { status: "success", message };
}

function logActionError(event: string, context: RequestContext | undefined, error: unknown): void {
  logger.error(event, {
    requestId: context?.requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

/**
 * Recalcula los totales del libro a partir de sus secciones.
 *
 * El recuento de palabras, el número de capítulos y el progreso se derivan
 * del contenido, nunca se escriben a mano: así no pueden divergir.
 */
/** Carga una sección del espacio de trabajo de la sesión. */
async function loadSectionForSession(
  session: SessionContext,
  sectionId: string,
): Promise<{
  id: string;
  bookId: string;
  title: string;
  version: number;
  content: unknown;
} | null> {
  const section = await prisma.bookSection.findFirst({
    where: {
      id: sectionId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, bookId: true, title: true, version: true, content: true },
  });

  return section;
}

/**
 * Guarda el contenido de una sección creando una revisión nueva.
 *
 * Las revisiones son inmutables: restaurar una versión anterior no la
 * modifica, sino que guarda su contenido como una revisión nueva. La base de
 * datos lo garantiza con un trigger que rechaza cualquier `UPDATE`.
 */
async function persistSectionContent(
  session: SessionContext,
  section: { id: string; bookId: string; title: string; version: number },
  document: TiptapDocument,
  reason: RevisionReason,
): Promise<{ version: number; wordCount: number }> {
  const wordCount = countWordsInDocument(document);
  const nextVersion = section.version + 1;

  await withSerializableRetry(() =>
    prisma.$transaction(
      async (transaction) => {
        await transaction.sectionRevision.create({
          data: {
            sectionId: section.id,
            createdById: session.user.id,
            version: nextVersion,
            content: document as unknown as Prisma.InputJsonValue,
            wordCount,
            reason,
            title: section.title,
          },
        });

        const saved = await transaction.bookSection.updateMany({
          where: {
            id: section.id,
            bookId: section.bookId,
            version: section.version,
            deletedAt: null,
            book: { workspaceId: session.workspace.id, deletedAt: null },
          },
          data: {
            content: document as unknown as Prisma.InputJsonValue,
            wordCount,
            version: nextVersion,
          },
        });

        if (saved.count !== 1) throw new Error("SECTION_VERSION_CONFLICT");
        await recomputeBookTotals(transaction, section.bookId);
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    ),
  );

  return { version: nextVersion, wordCount };
}

export async function createBookAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "book:create");
  } catch {
    return errorState("No tienes permisos para crear libros en este espacio de trabajo.");
  }

  const parsed = bookMetadataFormSchema.safeParse({
    title: formValue(formData, "title"),
    subtitle: formValue(formData, "subtitle"),
    authorName: formValue(formData, "authorName"),
    penName: formValue(formData, "penName"),
    description: formValue(formData, "description"),
    genre: formValue(formData, "genre"),
    language: formValue(formData, "language"),
    targetWordCount: formValue(formData, "targetWordCount"),
  });

  if (!parsed.success) {
    return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
  }

  let bookId: string;

  try {
    const book = await prisma.book.create({
      data: {
        workspaceId: session.workspace.id,
        createdById: session.user.id,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle ?? null,
        authorName: parsed.data.authorName,
        penName: parsed.data.penName ?? null,
        description: parsed.data.description ?? null,
        genre: parsed.data.genre ?? null,
        language: parsed.data.language,
        targetWordCount: parsed.data.targetWordCount ?? null,
      },
      select: { id: true },
    });

    bookId = book.id;
  } catch (error) {
    logActionError("books.create_error", context, error);
    return errorState("No se ha podido crear el libro. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_CREATED",
      entityType: "Book",
      entityId: bookId,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/books");

  redirect(`/books/${bookId}`);
}

export async function updateBookAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "book:update");
  } catch {
    return errorState("No tienes permisos para editar este libro.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const parsed = bookMetadataFormSchema.safeParse({
    title: formValue(formData, "title"),
    subtitle: formValue(formData, "subtitle"),
    authorName: formValue(formData, "authorName"),
    penName: formValue(formData, "penName"),
    description: formValue(formData, "description"),
    genre: formValue(formData, "genre"),
    language: formValue(formData, "language"),
    targetWordCount: formValue(formData, "targetWordCount"),
  });

  if (!parsed.success) {
    return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.book.updateMany({
        where: {
          id: bookId.data,
          workspaceId: session.workspace.id,
          deletedAt: null,
        },
        data: {
          title: parsed.data.title,
          subtitle: parsed.data.subtitle ?? null,
          authorName: parsed.data.authorName,
          penName: parsed.data.penName ?? null,
          description: parsed.data.description ?? null,
          genre: parsed.data.genre ?? null,
          language: parsed.data.language,
          targetWordCount: parsed.data.targetWordCount ?? null,
        },
      });

      if (updated.count > 0) {
        // El objetivo puede haber cambiado: el porcentaje de avance se
        // deriva del recuento real de palabras y del objetivo nuevo, no del
        // valor que quedó guardado con el objetivo anterior.
        await recomputeBookTotals(transaction, bookId.data);
      }

      return updated;
    });

    if (result.count === 0) {
      return errorState("El libro no existe en este espacio de trabajo.");
    }
  } catch (error) {
    logActionError("books.update_error", context, error);
    return errorState("No se ha podido guardar el libro. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_UPDATED",
      entityType: "Book",
      entityId: bookId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/books");
  revalidatePath(`/books/${bookId.data}`);

  return successState("Libro guardado.");
}

export async function deleteBookAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "book:delete");
  } catch {
    return errorState("No tienes permisos para eliminar libros.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  try {
    const result = await prisma.book.updateMany({
      where: { id: bookId.data, workspaceId: session.workspace.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      return errorState("El libro no existe en este espacio de trabajo.");
    }
  } catch (error) {
    logActionError("books.delete_error", context, error);
    return errorState("No se ha podido eliminar el libro. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_DELETED",
      entityType: "Book",
      entityId: bookId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/books");

  redirect("/books");
}

export async function createSectionAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "section:create");
  } catch {
    return errorState("No tienes permisos para crear secciones.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));
  const title = z.string().trim().min(1, "El título es obligatorio.").max(300);
  const type = sectionTypeSchema.safeParse(formValue(formData, "type"));
  const parentId = uuidSchema.safeParse(formValue(formData, "parentId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const parsedTitle = title.safeParse(formValue(formData, "title"));

  if (!parsedTitle.success) {
    return errorState(firstZodError(parsedTitle.error), zodFieldErrors(parsedTitle.error));
  }

  if (!type.success) {
    return errorState("El tipo de sección no es válido.");
  }

  if (type.data === "TABLE_OF_CONTENTS" || type.data === "COPYRIGHT") {
    return errorState("El índice y la página de derechos se generan solos");
  }

  const book = await prisma.book.findFirst({
    where: { id: bookId.data, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true },
  });

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  const resolvedParentId = parentId.success ? parentId.data : null;

  if (resolvedParentId) {
    const parent = await prisma.bookSection.findFirst({
      where: {
        id: resolvedParentId,
        // El padre tiene que ser del mismo libro: colgar una sección de otro
        // libro rompería el árbol y filtraría contenido entre libros.
        bookId: book.id,
        deletedAt: null,
        book: { workspaceId: session.workspace.id, deletedAt: null },
      },
      select: { id: true },
    });

    if (!parent) {
      return errorState("La sección padre no existe en este libro.");
    }
  }

  const last = await prisma.bookSection.findFirst({
    where: { bookId: book.id, parentId: resolvedParentId, deletedAt: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  let sectionId: string;

  try {
    const section = await prisma.$transaction(async (transaction) => {
      const created = await transaction.bookSection.create({
        data: {
          bookId: book.id,
          parentId: resolvedParentId,
          type: type.data,
          title: parsedTitle.data,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });

      // Crear un capítulo cambia el recuento de capítulos del libro; se
      // recalcula en la misma transacción para que la ficha no enseñe un
      // dato viejo hasta el siguiente guardado del manuscrito.
      await recomputeBookTotals(transaction, book.id);

      return created;
    });

    sectionId = section.id;
  } catch (error) {
    logActionError("books.section_create_error", context, error);
    return errorState("No se ha podido crear la sección. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_SECTION_CREATED",
      entityType: "BookSection",
      entityId: sectionId,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { type: type.data },
    },
    context,
  );

  revalidatePath(`/books/${book.id}`);

  redirect(`/books/${book.id}/sections/${sectionId}`);
}

/**
 * Cambia el titulo editorial de una seccion.
 *
 * El titulo forma parte del contenido exportado y del indice; por eso se
 * revalidan tambien la vista previa y la exportacion. No se incrementa la
 * version del manuscrito: el texto no ha cambiado y el editor abierto no debe
 * entrar en conflicto por un renombrado.
 */
export async function renameSectionAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return errorState("No tienes permisos para cambiar el titulo de la seccion.");
  }

  const sectionId = uuidSchema.safeParse(formValue(formData, "sectionId"));
  const title = z
    .string()
    .trim()
    .min(1, "El titulo es obligatorio.")
    .max(300, "El titulo no puede superar los 300 caracteres.");

  if (!sectionId.success) {
    return errorState("La seccion no es valida.");
  }

  const parsedTitle = title.safeParse(formValue(formData, "title"));

  if (!parsedTitle.success) {
    return errorState(firstZodError(parsedTitle.error), zodFieldErrors(parsedTitle.error));
  }

  const section = await prisma.bookSection.findFirst({
    where: {
      id: sectionId.data,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: {
      id: true,
      bookId: true,
      title: true,
      showTitle: true,
      showSectionType: true,
      showSectionNumber: true,
    },
  });

  if (!section) {
    return errorState("La seccion no existe en este espacio de trabajo.");
  }

  const showTitle = formData.get("showTitle") === "on";
  const showSectionType = formData.get("showSectionType") === "on";
  const showSectionNumber = formData.get("showSectionNumber") === "on";
  const unchanged =
    section.title === parsedTitle.data &&
    section.showTitle === showTitle &&
    section.showSectionType === showSectionType &&
    section.showSectionNumber === showSectionNumber;

  if (unchanged) {
    return successState("El titulo ya esta actualizado.");
  }

  try {
    await prisma.bookSection.update({
      where: { id: section.id },
      data: {
        title: parsedTitle.data,
        showTitle,
        showSectionType,
        showSectionNumber,
      },
    });
  } catch (error) {
    logActionError("books.section_rename_error", context, error);
    return errorState("No se ha podido guardar el titulo. Intentalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_SECTION_RENAMED",
      entityType: "BookSection",
      entityId: section.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: {
        previousTitle: section.title,
        title: parsedTitle.data,
        showTitle,
        showSectionType,
        showSectionNumber,
      },
    },
    context,
  );

  revalidatePath(`/books/${section.bookId}`);
  revalidatePath(`/books/${section.bookId}/sections/${section.id}`);
  revalidatePath(`/books/${section.bookId}/preview`);
  revalidatePath(`/books/${section.bookId}/export`);

  return successState("Titulo actualizado. La vista previa y las exportaciones ya lo incluyen.");
}

export async function saveSectionAction(
  _previousState: SectionSaveState,
  formData: FormData,
): Promise<SectionSaveState> {
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
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return errorState("No tienes permisos para editar este manuscrito.");
  }

  const sectionId = uuidSchema.safeParse(formValue(formData, "sectionId"));
  const expectedVersion = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(formValue(formData, "version"));
  const intent = z
    .enum(["manual", "autosave"])
    .safeParse(formValue(formData, "intent") || "manual");
  const force = formValue(formData, "force") === "on";

  if (!sectionId.success || !expectedVersion.success || !intent.success) {
    return errorState("Los datos del formulario no son válidos.");
  }

  const section = await loadSectionForSession(session, sectionId.data);

  if (!section) {
    return errorState("La sección no existe en este espacio de trabajo.");
  }

  // Control de concurrencia: si la sección cambió desde que el editor cargó
  // el contenido, guardar la pisaría. En lugar de eso se devuelven las dos
  // versiones para que la persona elija cuál conservar. La única forma de
  // seguir adelante sin comparar es pedirlo expresamente.
  if (section.version !== expectedVersion.data && !force) {
    const revision = await prisma.sectionRevision.findFirst({
      where: { sectionId: section.id },
      orderBy: { version: "desc" },
      select: { content: true, title: true, createdBy: { select: { name: true } } },
    });

    return {
      status: "error",
      message: "El servidor tiene una versión más reciente de esta sección. Elige cuál conservar.",
      conflict: {
        serverVersion: section.version,
        serverContent: JSON.stringify(revision?.content ?? section.content),
        serverTitle: revision?.title ?? section.title,
        serverAuthor: revision?.createdBy.name ?? null,
      },
    };
  }

  if (intent.data === "autosave" && !force) {
    const last = await prisma.sectionRevision.findFirst({
      where: { sectionId: section.id },
      orderBy: { version: "desc" },
      select: { createdAt: true },
    });

    if (last && Date.now() - last.createdAt.getTime() < AUTOSAVE_MIN_INTERVAL_MS) {
      // El texto **no** está guardado en el servidor: sigue pendiente. La
      // respuesta lo dice con claridad para que el editor no lo dé por
      // confirmado.
      return {
        status: "success",
        message: "Guardado automático pospuesto: hay un cambio muy reciente.",
        throttled: true,
        savedVersion: null,
      };
    }
  }

  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(JSON.parse(formValue(formData, "content")));
  } catch (error) {
    return errorState(
      error instanceof Error ? error.message : "El contenido del manuscrito no es válido.",
    );
  }

  let guardada: { version: number; wordCount: number };

  try {
    guardada = await persistSectionContent(
      session,
      section,
      document,
      intent.data === "autosave" ? "AUTO" : "MANUAL",
    );
  } catch (error) {
    logActionError("books.section_save_error", context, error);
    return errorState("No se ha podido guardar el manuscrito. Inténtalo de nuevo.");
  }

  let analysisTaskId: string | null = null;
  try {
    const contentHash = createHash("sha256").update(JSON.stringify(document), "utf8").digest("hex");
    const queued = await prisma.characterAnalysisTask.upsert({
      where: { sectionId_contentHash: { sectionId: section.id, contentHash } },
      create: {
        workspaceId: session.workspace.id,
        bookId: section.bookId,
        sectionId: section.id,
        contentHash,
      },
      update: {},
      select: { id: true },
    });
    analysisTaskId = queued.id;
  } catch (error) {
    logger.warn("story.character_analysis_enqueue_error", {
      requestId: context?.requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
  await writeAuditLog(
    {
      action: "BOOK_SECTION_SAVED",
      entityType: "BookSection",
      entityId: section.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { intent: intent.data, version: guardada.version },
    },
    context,
  );

  revalidatePath(`/books/${section.bookId}`);
  revalidatePath(`/books/${section.bookId}/sections/${section.id}`);

  return {
    status: "success",
    message: intent.data === "autosave" ? "Guardado automático." : "Manuscrito guardado.",
    savedVersion: guardada.version,
    analysisTaskId,
    throttled: false,
    conflict: null,
  };
}

export async function restoreRevisionAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "revision:restore");
  } catch {
    return errorState("No tienes permisos para restaurar revisiones.");
  }

  const sectionId = uuidSchema.safeParse(formValue(formData, "sectionId"));
  const revisionId = uuidSchema.safeParse(formValue(formData, "revisionId"));

  if (!sectionId.success || !revisionId.success) {
    return errorState("La revisión no es válida.");
  }

  const section = await loadSectionForSession(session, sectionId.data);

  if (!section) {
    return errorState("La sección no existe en este espacio de trabajo.");
  }

  const revision = await prisma.sectionRevision.findFirst({
    where: {
      id: revisionId.data,
      sectionId: section.id,
      section: { book: { workspaceId: session.workspace.id, deletedAt: null } },
    },
    select: { id: true, version: true, content: true },
  });

  if (!revision) {
    return errorState("La revisión no existe.");
  }

  let document: TiptapDocument;

  try {
    document = parseTiptapDocument(revision.content);
  } catch (error) {
    logActionError("books.revision_restore_error", context, error);
    return errorState("La revisión guardada no se puede leer.");
  }

  try {
    await persistSectionContent(session, section, document, "RESTORE");
  } catch (error) {
    logActionError("books.revision_restore_error", context, error);
    return errorState("No se ha podido restaurar la revisión. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_REVISION_RESTORED",
      entityType: "BookSection",
      entityId: section.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { restoredFromVersion: revision.version },
    },
    context,
  );

  revalidatePath(`/books/${section.bookId}`);
  revalidatePath(`/books/${section.bookId}/sections/${section.id}`);

  revalidatePath(`/books/${section.bookId}/sections/${section.id}/history`);
  return successState(`Revisión ${revision.version} restaurada como una versión nueva.`);
}

export async function moveSectionAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "section:move");
  } catch {
    return errorState("No tienes permisos para reordenar las secciones.");
  }

  const sectionId = uuidSchema.safeParse(formValue(formData, "sectionId"));
  const parentId = uuidSchema.safeParse(formValue(formData, "parentId"));
  const position = z.coerce.number().int().min(0).safeParse(formValue(formData, "position"));

  if (!sectionId.success || !position.success) {
    return errorState("Los datos del formulario no son válidos.");
  }

  const section = await loadSectionForSession(session, sectionId.data);

  if (!section) {
    return errorState("La sección no existe en este espacio de trabajo.");
  }

  const resolvedParentId = parentId.success ? parentId.data : null;
  let lastError: unknown;

  // Dos movimientos simultáneos pueden chocar al recalcular el orden. La
  // transacción serializable aborta uno y aquí se reintenta desde cero para
  // recalcular sobre el estado ya confirmado, nunca sobre una lectura vieja.
  for (let attempt = 0; attempt < SECTION_MOVE_ATTEMPTS; attempt += 1) {
    try {
      await moveSectionWithinBook(section, resolvedParentId, position.data);
      lastError = undefined;
      break;
    } catch (error) {
      if (error instanceof SectionMoveError) {
        return errorState(error.message);
      }

      lastError = error;

      if (!isSerializationConflict(error) || attempt === SECTION_MOVE_ATTEMPTS - 1) {
        break;
      }
    }
  }

  if (lastError !== undefined) {
    logActionError("books.section_move_error", context, lastError);
    return errorState("No se ha podido reordenar la sección. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_SECTION_MOVED",
      entityType: "BookSection",
      entityId: section.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: {
        bookId: section.bookId,
        parentId: resolvedParentId,
        position: position.data,
      },
    },
    context,
  );

  revalidatePath(`/books/${section.bookId}`);

  return successState("Sección reordenada.");
}

const SECTION_MOVE_ATTEMPTS = 3;

/** Error de negocio del reordenamiento: no se reintenta. */
class SectionMoveError extends Error {}

/** Indica si el fallo es un conflicto de serialización/deadlock de Postgres. */
function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

/**
 * Reordena una sección dentro de su libro en una transacción serializable.
 *
 * La validación del padre y el cálculo del orden ocurren en la misma
 * transacción que la escritura: la sección no puede terminar colgando de otro
 * libro, de una descendiente suya ni con un orden basado en una lectura
 * obsoleta. Todas las escrituras se restringen por `bookId`.
 */
async function moveSectionWithinBook(
  section: { id: string; bookId: string },
  parentId: string | null,
  position: number,
): Promise<void> {
  await withSerializableRetry(() =>
    prisma.$transaction(
      async (transaction) => {
        const current = await transaction.bookSection.findFirst({
          where: { id: section.id, bookId: section.bookId, deletedAt: null },
          select: { id: true, bookId: true },
        });

        if (!current) {
          throw new SectionMoveError("La sección ya no está disponible en este libro.");
        }

        if (parentId) {
          const parent = await transaction.bookSection.findFirst({
            where: { id: parentId, bookId: current.bookId, deletedAt: null },
            select: { id: true },
          });

          if (!parent) {
            throw new SectionMoveError("La sección padre no pertenece a este libro.");
          }

          if (await isDescendant(transaction, parent.id, current.id, current.bookId)) {
            throw new SectionMoveError(
              "Una sección no puede colgar de sí misma ni de una de sus descendientes.",
            );
          }
        }

        const siblings = await transaction.bookSection.findMany({
          where: {
            bookId: current.bookId,
            parentId,
            deletedAt: null,
            id: { not: current.id },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, title: true, type: true, parentId: true, sortOrder: true },
        });

        siblings.sort(compareEditorialSections);
        const ordered = siblings.map((sibling) => sibling.id);
        ordered.splice(Math.min(position, ordered.length), 0, current.id);

        for (const [order, id] of ordered.entries()) {
          await transaction.bookSection.updateMany({
            where: { id, bookId: current.bookId, deletedAt: null },
            data: {
              sortOrder: order,
              // Solo la sección movida cambia de padre; sus hermanas conservan
              // el suyo y únicamente se renumera su posición.
              ...(id === current.id ? { parentId } : {}),
            },
          });
        }
      },
      { isolationLevel: "Serializable", timeout: 15_000 },
    ),
  );
}

export async function deleteSectionAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "section:delete");
  } catch {
    return errorState("No tienes permisos para eliminar secciones.");
  }

  const sectionId = uuidSchema.safeParse(formValue(formData, "sectionId"));

  if (!sectionId.success) {
    return errorState("La sección no es válida.");
  }

  const section = await loadSectionForSession(session, sectionId.data);

  if (!section) {
    return errorState("La sección no existe en este espacio de trabajo.");
  }

  const now = new Date();
  let affectedSections = 0;

  try {
    await prisma.$transaction(async (transaction) => {
      const descendants = await collectDescendants(transaction, section.id, section.bookId);
      affectedSections = descendants.length;

      await transaction.bookSection.updateMany({
        where: {
          id: { in: descendants },
          // El borrado se limita al libro de la sección: aunque un parentId
          // corrupto apuntara fuera, nunca se toca otro libro.
          bookId: section.bookId,
          deletedAt: null,
        },
        data: { deletedAt: now },
      });

      await recomputeBookTotals(transaction, section.bookId);
    });
  } catch (error) {
    logActionError("books.section_delete_error", context, error);
    return errorState("No se ha podido eliminar la sección. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_SECTION_DELETED",
      entityType: "BookSection",
      entityId: section.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { affectedSections },
    },
    context,
  );

  revalidatePath(`/books/${section.bookId}`);
  revalidatePath(`/books/${section.bookId}/preview`);
  revalidatePath(`/books/${section.bookId}/export`);
  if (formValue(formData, "stayInEditor") === "on") {
    return successState("Sección y subsecciones eliminadas.");
  }

  redirect(`/books/${section.bookId}`);
}

export async function changeBookStatusAction(
  _previousState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
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
    assertCanPerform(session.workspace.role, "book:changeStatus");
  } catch {
    return errorState("No tienes permisos para cambiar el estado de este libro.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));
  const status = z
    .enum(["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETE", "ARCHIVED"])
    .safeParse(formValue(formData, "status"));

  if (!bookId.success || !status.success) {
    return errorState("Los datos del formulario no son válidos.");
  }

  const book = await prisma.book.findFirst({
    where: { id: bookId.data, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  if (book.status === status.data) {
    return successState("El libro ya tiene ese estado.");
  }

  if (!canTransitionTo(book.status, status.data)) {
    return errorState("Ese cambio de estado no está permitido.");
  }

  try {
    await prisma.book.update({
      where: { id: book.id },
      data: { status: status.data },
    });
  } catch (error) {
    logActionError("books.status_error", context, error);
    return errorState("No se ha podido cambiar el estado. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "BOOK_STATUS_CHANGED",
      entityType: "Book",
      entityId: book.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { from: book.status, to: status.data },
    },
    context,
  );

  revalidatePath("/books");
  revalidatePath(`/books/${book.id}`);

  return successState("Estado actualizado.");
}

/** Indica si `candidateId` está dentro de la rama de `ancestorId`. */
async function isDescendant(
  client: Prisma.TransactionClient,
  candidateId: string,
  ancestorId: string,
  bookId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  let current: string | null = candidateId;

  while (current) {
    if (current === ancestorId) {
      return true;
    }

    if (visited.has(current)) {
      return false;
    }

    visited.add(current);

    const parent: { parentId: string | null } | null = await client.bookSection.findFirst({
      // La cadena se recorre dentro del mismo libro: un parentId cruzado no
      // puede colar una sección de otro libro en la comprobación de ciclos.
      where: { id: current, bookId, deletedAt: null },
      select: { parentId: true },
    });

    current = parent?.parentId ?? null;
  }

  return false;
}

/** Identificadores de la sección y de todas sus descendientes dentro del libro. */
async function collectDescendants(
  client: Prisma.TransactionClient,
  sectionId: string,
  bookId: string,
): Promise<string[]> {
  const collected = [sectionId];
  const pending = [sectionId];

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    const children = await client.bookSection.findMany({
      where: { parentId: current, bookId, deletedAt: null },
      select: { id: true },
    });

    for (const child of children) {
      if (!collected.includes(child.id)) {
        collected.push(child.id);
        pending.push(child.id);
      }
    }
  }

  return collected;
}
