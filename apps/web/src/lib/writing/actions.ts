"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logActionError } from "@/lib/action-logging";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";

/**
 * Notas privadas y objetivos de escritura.
 *
 * Las notas son personales: cada acción filtra por `userId`, de modo que
 * nadie puede leer ni modificar las notas de otra persona aunque conozca su
 * identificador.
 */

const uuidSchema = z.string().uuid("El identificador no es válido.");

const noteSchema = z.object({
  bookId: uuidSchema,
  sectionId: z.union([uuidSchema, z.literal("")]).optional(),
  title: z.string().trim().min(1, "El título es obligatorio.").max(200),
  content: z.string().trim().min(1, "La nota no puede estar vacía.").max(20_000),
});

const goalSchema = z.object({
  bookId: z.union([uuidSchema, z.literal("")]).optional(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  targetWords: z.coerce
    .number()
    .int()
    .positive("El objetivo debe ser mayor que cero.")
    .max(1_000_000),
});

/** Comprueba que el libro existe en el espacio de trabajo. */
async function assertBookInWorkspace(session: SessionContext, bookId: string): Promise<boolean> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true },
  });

  return Boolean(book);
}

export async function createNoteAction(
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

  const parsed = noteSchema.safeParse({
    bookId: formValue(formData, "bookId"),
    sectionId: formValue(formData, "sectionId"),
    title: formValue(formData, "title"),
    content: formValue(formData, "content"),
  });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "La nota no es válida.");
  }

  if (!(await assertBookInWorkspace(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  const sectionId = parsed.data.sectionId ? parsed.data.sectionId : null;

  if (sectionId) {
    const section = await prisma.bookSection.findFirst({
      where: {
        id: sectionId,
        bookId: parsed.data.bookId,
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
    const note = await prisma.writingNote.create({
      data: {
        userId: session.user.id,
        bookId: parsed.data.bookId,
        sectionId,
        title: parsed.data.title,
        content: parsed.data.content,
      },
      select: { id: true },
    });

    await writeAuditLog(
      {
        action: "WRITING_NOTE_CREATED",
        entityType: "WritingNote",
        entityId: note.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
      },
      context,
    );
  } catch (error) {
    logActionError("writing.note_create_error", context, error);
    return errorState("No se ha podido crear la nota. Inténtalo de nuevo.");
  }

  revalidatePath(`/books/${parsed.data.bookId}/notes`);

  return successState("Nota guardada.");
}

export async function updateNoteAction(
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

  const noteId = uuidSchema.safeParse(formValue(formData, "noteId"));
  const title = z.string().trim().min(1, "El título es obligatorio.").max(200);
  const content = z.string().trim().min(1, "La nota no puede estar vacía.").max(20_000);

  if (!noteId.success) {
    return errorState("La nota no es válida.");
  }

  const parsedTitle = title.safeParse(formValue(formData, "title"));
  const parsedContent = content.safeParse(formValue(formData, "content"));

  if (!parsedTitle.success || !parsedContent.success) {
    return errorState("La nota no es válida.");
  }

  const existing = await prisma.writingNote.findFirst({
    where: {
      id: noteId.data,
      userId: session.user.id,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, bookId: true },
  });

  if (!existing) {
    return errorState("La nota no existe o no es tuya.");
  }

  try {
    await prisma.writingNote.update({
      where: { id: existing.id },
      data: { title: parsedTitle.data, content: parsedContent.data },
    });
  } catch (error) {
    logActionError("writing.note_update_error", context, error);
    return errorState("No se ha podido guardar la nota. Inténtalo de nuevo.");
  }

  revalidatePath(`/books/${existing.bookId}/notes`);
  revalidatePath("/notes");

  return successState("Nota actualizada.");
}

export async function deleteNoteAction(
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

  const noteId = uuidSchema.safeParse(formValue(formData, "noteId"));

  if (!noteId.success) {
    return errorState("La nota no es válida.");
  }

  const note = await prisma.writingNote.findFirst({
    where: { id: noteId.data, userId: session.user.id, deletedAt: null },
    select: { id: true, bookId: true },
  });

  if (!note) {
    return errorState("La nota no existe o no es tuya.");
  }

  try {
    await prisma.writingNote.update({
      where: { id: note.id },
      data: { deletedAt: new Date() },
    });
  } catch (error) {
    logActionError("writing.note_delete_error", context, error);
    return errorState("No se ha podido eliminar la nota. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "WRITING_NOTE_DELETED",
      entityType: "WritingNote",
      entityId: note.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath(`/books/${note.bookId}/notes`);
  revalidatePath("/notes");

  return successState("Nota eliminada.");
}

export async function toggleNotePinAction(
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

  const noteId = uuidSchema.safeParse(formValue(formData, "noteId"));

  if (!noteId.success) {
    return errorState("La nota no es válida.");
  }

  const note = await prisma.writingNote.findFirst({
    where: { id: noteId.data, userId: session.user.id, deletedAt: null },
    select: { id: true, isPinned: true, bookId: true },
  });

  if (!note) {
    return errorState("La nota no existe o no es tuya.");
  }

  try {
    await prisma.writingNote.update({
      where: { id: note.id },
      data: { isPinned: !note.isPinned },
    });
  } catch (error) {
    logActionError("writing.note_pin_error", context, error);
    return errorState("No se ha podido fijar la nota. Inténtalo de nuevo.");
  }

  revalidatePath(`/books/${note.bookId}/notes`);

  return successState(note.isPinned ? "Nota desfijada." : "Nota fijada.");
}

export async function setGoalAction(
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

  const parsed = goalSchema.safeParse({
    bookId: formValue(formData, "bookId"),
    periodStart: formValue(formData, "periodStart"),
    periodEnd: formValue(formData, "periodEnd"),
    targetWords: formValue(formData, "targetWords"),
  });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "El objetivo no es válido.");
  }

  if (parsed.data.periodEnd <= parsed.data.periodStart) {
    return errorState("El periodo debe terminar después de empezar.");
  }

  const bookId = parsed.data.bookId ? parsed.data.bookId : null;

  if (bookId && !(await assertBookInWorkspace(session, bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    await prisma.writingGoal.create({
      data: {
        userId: session.user.id,
        bookId,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        targetWords: parsed.data.targetWords,
      },
    });
  } catch (error) {
    logActionError("writing.goal_create_error", context, error);
    return errorState("No se ha podido guardar el objetivo. Inténtalo de nuevo.");
  }

  await writeAuditLog(
    {
      action: "WRITING_GOAL_SET",
      entityType: "WritingGoal",
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { targetWords: parsed.data.targetWords, bookId },
    },
    context,
  );

  revalidatePath("/stats");

  return successState("Objetivo guardado.");
}

export async function deleteGoalAction(
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

  const goalId = uuidSchema.safeParse(formValue(formData, "goalId"));

  if (!goalId.success) {
    return errorState("El objetivo no es válido.");
  }

  try {
    const result = await prisma.writingGoal.deleteMany({
      where: { id: goalId.data, userId: session.user.id },
    });

    if (result.count === 0) {
      return errorState("El objetivo no existe o no es tuyo.");
    }
  } catch (error) {
    logActionError("writing.goal_delete_error", context, error);
    return errorState("No se ha podido eliminar el objetivo. Inténtalo de nuevo.");
  }

  revalidatePath("/stats");

  return successState("Objetivo eliminado.");
}
