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
import { characterFormSchema, storyIdSchema } from "./validation";

/** Fichas de personaje de la biblia de la historia. */

function characterFields(formData: FormData) {
  return {
    bookId: formValue(formData, "bookId"),
    name: formValue(formData, "name"),
    aliases: formValue(formData, "aliases"),
    role: formValue(formData, "role"),
    age: formValue(formData, "age"),
    occupation: formValue(formData, "occupation"),
    summary: formValue(formData, "summary"),
    description: formValue(formData, "description"),
    personality: formValue(formData, "personality"),
    motivation: formValue(formData, "motivation"),
    conflict: formValue(formData, "conflict"),
    arc: formValue(formData, "arc"),
    notes: formValue(formData, "notes"),
  };
}

export async function createCharacterAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const parsed = characterFormSchema.safeParse(characterFields(formData));

  if (!parsed.success) {
    return errorState(
      parsed.error.issues[0]?.message ?? "La ficha no es válida.",
      fieldErrorsFrom(parsed.error),
    );
  }

  if (!(await storyBookExists(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    const character = await prisma.storyCharacter.create({
      data: {
        workspaceId: session.workspace.id,
        createdById: session.user.id,
        ...parsed.data,
      },
      select: { id: true },
    });

    await writeAuditLog(
      {
        action: "STORY_CHARACTER_CREATED",
        entityType: "StoryCharacter",
        entityId: character.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, role: parsed.data.role },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.character_create_error", context, error);
    return errorState("No se ha podido crear el personaje. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/characters", [parsed.data.bookId]);

  return successState("Personaje creado.");
}

export async function updateCharacterAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const characterId = storyIdSchema.safeParse(formValue(formData, "characterId"));

  if (!characterId.success) {
    return errorState("El personaje no es válido.");
  }

  const parsed = characterFormSchema.safeParse(characterFields(formData));

  if (!parsed.success) {
    return errorState(
      parsed.error.issues[0]?.message ?? "La ficha no es válida.",
      fieldErrorsFrom(parsed.error),
    );
  }

  const existing = await prisma.storyCharacter.findFirst({
    where: {
      id: characterId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true },
  });

  if (!existing) {
    return errorState("El personaje no existe en este espacio de trabajo.");
  }

  if (!(await storyBookExists(session, parsed.data.bookId))) {
    return errorState("El libro no existe en este espacio de trabajo.");
  }

  try {
    await prisma.storyCharacter.update({
      where: { id: existing.id },
      data: parsed.data,
    });

    await writeAuditLog(
      {
        action: "STORY_CHARACTER_UPDATED",
        entityType: "StoryCharacter",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { bookId: parsed.data.bookId, role: parsed.data.role },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.character_update_error", context, error);
    return errorState("No se ha podido guardar el personaje. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/characters", [existing.bookId, parsed.data.bookId]);

  return successState("Personaje actualizado.");
}

export async function deleteCharacterAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();

  if (!start.ok) {
    return start.state;
  }

  const { session, context } = start;
  const characterId = storyIdSchema.safeParse(formValue(formData, "characterId"));

  if (!characterId.success) {
    return errorState("El personaje no es válido.");
  }

  const existing = await prisma.storyCharacter.findFirst({
    where: {
      id: characterId.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, bookId: true, name: true },
  });

  if (!existing) {
    return errorState("El personaje no existe en este espacio de trabajo.");
  }

  try {
    await prisma.storyCharacter.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog(
      {
        action: "STORY_CHARACTER_DELETED",
        entityType: "StoryCharacter",
        entityId: existing.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { name: existing.name },
      },
      context,
    );
  } catch (error) {
    logStoryError("story.character_delete_error", context, error);
    return errorState("No se ha podido eliminar el personaje. Inténtalo de nuevo.");
  }

  revalidateStoryPaths("/characters", [existing.bookId]);

  return successState("Personaje eliminado.");
}
