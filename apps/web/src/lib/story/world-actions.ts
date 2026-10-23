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
import { storyIdSchema, worldFormSchema } from "./validation";

/** Mundos, lugares y reglas de la historia. */

function worldFields(formData: FormData) {
  return {
    bookId: formValue(formData, "bookId"),
    name: formValue(formData, "name"),
    kind: formValue(formData, "kind"),
    summary: formValue(formData, "summary"),
    description: formValue(formData, "description"),
    rules: formValue(formData, "rules"),
    notes: formValue(formData, "notes"),
  };
}

export async function createWorldAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const parsed = worldFormSchema.safeParse(worldFields(formData));

  if (!parsed.success) {
    return errorState(
      parsed.error.issues[0]?.message ?? "El mundo no es válido.",
      fieldErrorsFrom(parsed.error),
    );
  }

  if (!(await storyBookExists(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    const world = await prisma.storyWorld.create({
      data: {
        workspaceId: session.workspace.id,
        createdById: session.user.id,
        ...parsed.data,
      },
      select: { id: true },
    });

    await writeAuditLog(
      {
        action: "STORY_WORLD_CREATED",
        entityType: "StoryWorld",
        entityId: world.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, kind: parsed.data.kind },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.world_create_error", context, error);
    return errorState("No se ha podido crear el mundo. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/worlds", [parsed.data.bookId]);

  return successState("Mundo creado.");
}

export async function updateWorldAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const worldId = storyIdSchema.safeParse(formValue(formData, "worldId"));

  if (!worldId.success) {
    return errorState("El mundo no es válido.");
  }

  const parsed = worldFormSchema.safeParse(worldFields(formData));

  if (!parsed.success) {
    return errorState(
      parsed.error.issues[0]?.message ?? "El mundo no es válido.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const existing = await prisma.storyWorld.findFirst({
    where: {
      id: worldId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true },
  });

  if (!existing) {
    return errorState("El mundo no existe en este espacio de trabajo.");
  }

  if (!(await storyBookExists(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    await prisma.storyWorld.update({
      where: { id: existing.id },
      data: parsed.data,
    });

    await writeAuditLog(
      {
        action: "STORY_WORLD_UPDATED",
        entityType: "StoryWorld",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, kind: parsed.data.kind },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.world_update_error", context, error);
    return errorState("No se ha podido guardar el mundo. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/worlds", [existing.bookId, parsed.data.bookId]);

  return successState("Mundo actualizado.");
}

export async function deleteWorldAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const worldId = storyIdSchema.safeParse(formValue(formData, "worldId"));

  if (!worldId.success) {
    return errorState("El mundo no es válido.");
  }

  const existing = await prisma.storyWorld.findFirst({
    where: {
      id: worldId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true, name: true },
  });

  if (!existing) {
    return errorState("El mundo no existe en este espacio de trabajo.");
  }

  try {
    await prisma.storyWorld.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog(
      {
        action: "STORY_WORLD_DELETED",
        entityType: "StoryWorld",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { name: existing.name },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.world_delete_error", context, error);
    return errorState("No se ha podido eliminar el mundo. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/worlds", [existing.bookId]);

  return successState("Mundo eliminado.");
}
