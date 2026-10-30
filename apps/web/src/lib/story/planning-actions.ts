"use server";

import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/auth/audit";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import {
  beginStoryAction,
  fieldErrorsFrom,
  logStoryError,
  revalidateStoryPaths,
  storyBookExists,
} from "./action-helpers";
import { planItemFormSchema, planStatusFormSchema, storyIdSchema } from "./validation";

/**
 * Planificación de la historia.
 *
 * Las ideas pueden pertenecer a un libro o quedar como material general del
 * estudio. Todas las acciones filtran por el espacio de trabajo de la sesión.
 */

function planFields(formData: FormData) {
  return {
    bookId: formValue(formData, "bookId"),
    title: formValue(formData, "title"),
    kind: formValue(formData, "kind"),
    status: formValue(formData, "status"),
    summary: formValue(formData, "summary"),
  };
}

export async function createPlanItemAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const parsed = planItemFormSchema.safeParse(planFields(formData));

  if (!parsed.success) {
    return errorState(
      parsed.error.issues[0]?.message ?? "La idea no es válida.",
      fieldErrorsFrom(parsed.error),
    );
  }

  if (parsed.data.bookId)
    return errorState("Abre el tablero del libro para organizar sus tarjetas.");

  if (!(await storyBookExists(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    const item = await prisma.storyPlanItem.create({
      data: {
        workspaceId: session.workspace.id,
        createdById: session.user.id,
        bookId: parsed.data.bookId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        kind: parsed.data.kind,
        status: parsed.data.status,
      },
      select: { id: true },
    });

    await writeAuditLog(
      {
        action: "STORY_PLAN_ITEM_CREATED",
        entityType: "StoryPlanItem",
        entityId: item.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, status: parsed.data.status },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.plan_create_error", context, error);
    return errorState("No se ha podido guardar la idea. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/planning", [parsed.data.bookId]);

  return successState("Idea añadida al plan.");
}

export async function updatePlanItemAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const itemId = storyIdSchema.safeParse(formValue(formData, "itemId"));

  if (!itemId.success) {
    return errorState("La idea no es válida.");
  }

  const parsed = planItemFormSchema.safeParse(planFields(formData));

  if (!parsed.success) {
    return errorState(
      parsed.error.issues[0]?.message ?? "La idea no es válida.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const existing = await prisma.storyPlanItem.findFirst({
    where: {
      id: itemId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true },
  });

  if (!existing) {
    return errorState("La idea no existe en este espacio de trabajo.");
  }
  if (existing.bookId) return errorState("Abre el tablero del libro para modificar esta tarjeta.");

  if (parsed.data.bookId)
    return errorState("Abre el tablero del libro para organizar sus tarjetas.");

  if (!(await storyBookExists(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    await prisma.storyPlanItem.update({
      where: { id: existing.id },
      data: {
        bookId: parsed.data.bookId,
        title: parsed.data.title,
        summary: parsed.data.summary,
        kind: parsed.data.kind,
        status: parsed.data.status,
      },
    });

    await writeAuditLog(
      {
        action: "STORY_PLAN_ITEM_UPDATED",
        entityType: "StoryPlanItem",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, status: parsed.data.status },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.plan_update_error", context, error);
    return errorState("No se ha podido actualizar la idea. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/planning", [existing.bookId, parsed.data.bookId]);

  return successState("Idea actualizada.");
}

export async function updatePlanStatusAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const itemId = storyIdSchema.safeParse(formValue(formData, "itemId"));
  const parsed = planStatusFormSchema.safeParse({ status: formValue(formData, "status") });

  if (!itemId.success || !parsed.success) {
    return errorState("El estado no es válido.");
  }

  const existing = await prisma.storyPlanItem.findFirst({
    where: {
      id: itemId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true, status: true },
  });

  if (!existing) {
    return errorState("La idea no existe en este espacio de trabajo.");
  }
  if (existing.bookId) return errorState("Abre el tablero del libro para modificar esta tarjeta.");

  if (existing.status === parsed.data.status) {
    return successState("La idea ya estaba en ese estado.");
  }

  try {
    await prisma.storyPlanItem.update({
      where: { id: existing.id },
      data: { status: parsed.data.status },
    });

    await writeAuditLog(
      {
        action: "STORY_PLAN_ITEM_STATUS_CHANGED",
        entityType: "StoryPlanItem",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { from: existing.status, to: parsed.data.status },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.plan_status_error", context, error);
    return errorState("No se ha podido cambiar el estado. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/planning", [existing.bookId]);

  return successState("Estado actualizado.");
}

export async function deletePlanItemAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const itemId = storyIdSchema.safeParse(formValue(formData, "itemId"));

  if (!itemId.success) {
    return errorState("La idea no es válida.");
  }

  const existing = await prisma.storyPlanItem.findFirst({
    where: {
      id: itemId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true, title: true },
  });

  if (!existing) {
    return errorState("La idea no existe en este espacio de trabajo.");
  }
  if (existing.bookId) return errorState("Abre el tablero del libro para modificar esta tarjeta.");

  try {
    await prisma.storyPlanItem.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog(
      {
        action: "STORY_PLAN_ITEM_DELETED",
        entityType: "StoryPlanItem",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { title: existing.title },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.plan_delete_error", context, error);
    return errorState("No se ha podido eliminar la idea. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/planning", [existing.bookId]);

  return successState("Idea eliminada.");
}
