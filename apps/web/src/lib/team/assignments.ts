"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { assertCanPerform } from "@/lib/books/permissions";

/**
 * Asignación de trabajo.
 *
 * Una sección o un comentario se pueden asignar a una persona del estudio.
 * Quien asigna debe ser del estudio y la persona asignada también: no se
 * puede asignar trabajo a alguien de otro espacio.
 */

const uuidSchema = z.string().uuid("El identificador no es válido.");

/** Comprueba que la persona pertenece al estudio. */
async function esMiembro(workspaceId: string, userId: string): Promise<boolean> {
  const miembro = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });

  return Boolean(miembro);
}

export async function assignSectionAction(
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
    assertCanPerform(session.workspace.role, "section:update");
  } catch {
    return errorState("No tienes permisos para asignar trabajo.");
  }

  const sectionId = uuidSchema.safeParse(formValue(formData, "sectionId"));
  const assignee = uuidSchema.safeParse(formValue(formData, "assigneeId"));

  if (!sectionId.success) {
    return errorState("La sección no es válida.");
  }

  const seccion = await prisma.bookSection.findFirst({
    where: {
      id: sectionId.data,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, bookId: true, title: true },
  });

  if (!seccion) {
    return errorState("La sección no existe en este espacio de trabajo.");
  }

  const destino = assignee.success ? assignee.data : null;

  if (destino && !(await esMiembro(session.workspace.id, destino))) {
    return errorState("Esa persona no forma parte del estudio.");
  }

  await prisma.bookSection.update({
    where: { id: seccion.id },
    data: { assigneeId: destino },
  });

  await writeAuditLog(
    {
      action: "TEAM_SECTION_ASSIGNED",
      entityType: "BookSection",
      entityId: seccion.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { assigneeId: destino, title: seccion.title },
    },
    context,
  );

  revalidatePath(`/books/${seccion.bookId}/sections/${seccion.id}`);

  return successState(destino ? "Sección asignada." : "Asignación retirada.");
}

export async function assignCommentAction(
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
    return errorState("No tienes permisos para asignar comentarios.");
  }

  const commentId = uuidSchema.safeParse(formValue(formData, "commentId"));
  const assignee = uuidSchema.safeParse(formValue(formData, "assigneeId"));

  if (!commentId.success) {
    return errorState("El comentario no es válido.");
  }

  const comentario = await prisma.editorialComment.findFirst({
    where: {
      id: commentId.data,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { id: true, bookId: true },
  });

  if (!comentario) {
    return errorState("El comentario no existe en este espacio de trabajo.");
  }

  const destino = assignee.success ? assignee.data : null;

  if (destino && !(await esMiembro(session.workspace.id, destino))) {
    return errorState("Esa persona no forma parte del estudio.");
  }

  await prisma.editorialComment.update({
    where: { id: comentario.id },
    data: { assigneeId: destino },
  });

  await writeAuditLog(
    {
      action: "TEAM_COMMENT_ASSIGNED",
      entityType: "EditorialComment",
      entityId: comentario.id,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { assigneeId: destino },
    },
    context,
  );

  revalidatePath(`/books/${comentario.bookId}/review`);

  return successState(destino ? "Comentario asignado." : "Asignación retirada.");
}
