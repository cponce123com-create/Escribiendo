"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { assertCanPerform } from "@/lib/books/permissions";
import { canTransitionTo } from "@/lib/books/status";
import { countOpenComments } from "./comments";

/**
 * Comentarios editoriales y flujo de revisión.
 *
 * Un libro se puede enviar a revisión y aprobar. Aprobar exige que no
 * queden comentarios abiertos: es la garantía de que la edición ha sido
 * tenida en cuenta.
 */

const uuidSchema = z.string().uuid("El identificador no es válido.");

const commentSchema = z.object({
  bookId: uuidSchema,
  sectionId: z.union([uuidSchema, z.literal("")]).optional(),
  body: z.string().trim().min(1, "El comentario no puede estar vacío.").max(10_000),
});

function logActionError(event: string, context: RequestContext | undefined, error: unknown): void {
  logger.error(event, {
    requestId: context?.requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

async function findBook(session: SessionContext, bookId: string) {
  return prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, status: true, title: true },
  });
}

export async function createCommentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    assertCanPerform(session.workspace.role, "comment:create");
  } catch {
    return errorState("No tienes permisos para comentar en este espacio de trabajo.");
  }

  const parsed = commentSchema.safeParse({
    bookId: formValue(formData, "bookId"),
    sectionId: formValue(formData, "sectionId"),
    body: formValue(formData, "body"),
  });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "El comentario no es válido.");
  }

  const book = await findBook(session, parsed.data.bookId);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  const sectionId = parsed.data.sectionId ? parsed.data.sectionId : null;

  if (sectionId) {
    const section = await prisma.bookSection.findFirst({
      where: {
        id: sectionId,
        bookId: book.id,
        deletedAt: null,
        book: { workspaceId: session.workspace.id, deletedAt: null },
      },
      select: { id: true },
    });

    if (!section) {
      return errorState("La sección no existe en este libro.");
    }
  }

  try {
    const comment = await prisma.editorialComment.create({
      data: {
        bookId: book.id,
        sectionId,
        authorId: session.user.id,
        body: parsed.data.body,
      },
      select: { id: true },
    });

    await writeAuditLog(
      {
        action: "REVIEW_COMMENT_CREATED",
        entityType: "EditorialComment",
        entityId: comment.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
      },
      context,
    );
  } catch (error) {
    logActionError("review.comment_create_error", context, error);
    return errorState("No se ha podido publicar el comentario. Inténtalo de nuevo.");
  }

  revalidatePath(`/books/${book.id}/review`);

  return successState("Comentario publicado.");
}

export async function resolveCommentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

  const commentId = uuidSchema.safeParse(formValue(formData, "commentId"));

  if (!commentId.success) {
    return errorState("El comentario no es válido.");
  }

  const comment = await prisma.editorialComment.findFirst({
    where: {
      id: commentId.data,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, bookId: true, authorId: true, status: true },
  });

  if (!comment) {
    return errorState("El comentario no existe en este espacio de trabajo.");
  }

  // Resolver un comentario propio o de cualquiera requiere permiso de
  // edición; el resto no puede tocarlo.
  const isAuthor = comment.authorId === session.user.id;

  if (!isAuthor) {
    try {
      assertCanPerform(session.workspace.role, "comment:resolve");
    } catch {
      return errorState("Solo puedes resolver tus propios comentarios.");
    }
  }

  if (comment.status === "RESOLVED") {
    return errorState("El comentario ya está resuelto.");
  }

  try {
    await prisma.editorialComment.update({
      where: { id: comment.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: session.user.id },
    });
  } catch (error) {
    logActionError("review.comment_resolve_error", context, error);
    return errorState("No se ha podido resolver el comentario. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "REVIEW_COMMENT_RESOLVED",
      entityType: "EditorialComment",
      entityId: comment.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath(`/books/${comment.bookId}/review`);

  return successState("Comentario resuelto.");
}

export async function reopenCommentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

  const commentId = uuidSchema.safeParse(formValue(formData, "commentId"));

  if (!commentId.success) {
    return errorState("El comentario no es válido.");
  }

  const comment = await prisma.editorialComment.findFirst({
    where: {
      id: commentId.data,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, bookId: true, authorId: true, status: true },
  });

  if (!comment) {
    return errorState("El comentario no existe en este espacio de trabajo.");
  }

  const isAuthor = comment.authorId === session.user.id;

  if (!isAuthor) {
    try {
      assertCanPerform(session.workspace.role, "comment:resolve");
    } catch {
      return errorState("Solo puedes reabrir tus propios comentarios.");
    }
  }

  if (comment.status === "OPEN") {
    return errorState("El comentario ya está abierto.");
  }

  try {
    await prisma.editorialComment.update({
      where: { id: comment.id },
      data: { status: "OPEN", resolvedAt: null, resolvedById: null },
    });
  } catch (error) {
    logActionError("review.comment_reopen_error", context, error);
    return errorState("No se ha podido reabrir el comentario. Inténtalo de nuevo.");
  }

  revalidatePath(`/books/${comment.bookId}/review`);

  return successState("Comentario reabierto.");
}

/** Envía el libro a revisión. */
export async function submitForReviewAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    assertCanPerform(session.workspace.role, "book:submitForReview");
  } catch {
    return errorState("No tienes permisos para enviar este libro a revisión.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const book = await findBook(session, bookId.data);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  if (!canTransitionTo(book.status, "REVIEW")) {
    return errorState("Este libro no puede pasar a revisión desde su estado actual.");
  }

  try {
    await prisma.book.update({ where: { id: book.id }, data: { status: "REVIEW" } });
  } catch (error) {
    logActionError("review.submit_error", context, error);
    return errorState("No se ha podido enviar a revisión. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "REVIEW_BOOK_SUBMITTED",
      entityType: "Book",
      entityId: book.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { from: book.status, to: "REVIEW" },
    },
    context,
  );

  revalidatePath("/books/[bookId]", "page");
  revalidatePath(`/books/${book.id}/review`);

  return successState("Libro enviado a revisión.");
}

/** Aprueba el libro. Exige que no queden comentarios abiertos. */
export async function approveBookAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    assertCanPerform(session.workspace.role, "book:approve");
  } catch {
    return errorState("No tienes permisos para aprobar este libro.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const book = await findBook(session, bookId.data);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  if (!canTransitionTo(book.status, "COMPLETE")) {
    return errorState("Este libro no puede marcarse como completo desde su estado actual.");
  }

  const open = await countOpenComments(session, book.id);

  if (open > 0) {
    return errorState(
      `Quedan ${open} ${open === 1 ? "comentario abierto" : "comentarios abiertos"}. Resuélvelos antes de aprobar el libro.`,
    );
  }

  try {
    await prisma.book.update({ where: { id: book.id }, data: { status: "COMPLETE" } });
  } catch (error) {
    logActionError("review.approve_error", context, error);
    return errorState("No se ha podido aprobar el libro. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "REVIEW_BOOK_APPROVED",
      entityType: "Book",
      entityId: book.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { from: book.status, to: "COMPLETE" },
    },
    context,
  );

  revalidatePath("/books/[bookId]", "page");
  revalidatePath(`/books/${book.id}/review`);

  return successState("Libro aprobado.");
}

/** Devuelve el libro a escritura. */
export async function requestChangesAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    assertCanPerform(session.workspace.role, "book:submitForReview");
  } catch {
    return errorState("No tienes permisos para cambiar el estado de este libro.");
  }

  const bookId = uuidSchema.safeParse(formValue(formData, "bookId"));

  if (!bookId.success) {
    return errorState("El libro no es válido.");
  }

  const book = await findBook(session, bookId.data);

  if (!book) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  if (!canTransitionTo(book.status, "IN_PROGRESS")) {
    return errorState("Este libro no puede volver a escritura desde su estado actual.");
  }

  try {
    await prisma.book.update({ where: { id: book.id }, data: { status: "IN_PROGRESS" } });
  } catch (error) {
    logActionError("review.request_changes_error", context, error);
    return errorState("No se ha podido cambiar el estado. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "REVIEW_CHANGES_REQUESTED",
      entityType: "Book",
      entityId: book.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { from: book.status, to: "IN_PROGRESS" },
    },
    context,
  );

  revalidatePath("/books/[bookId]", "page");
  revalidatePath(`/books/${book.id}/review`);

  return successState("Se han pedido cambios.");
}
