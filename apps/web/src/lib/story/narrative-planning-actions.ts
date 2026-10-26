"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { beginStoryAction } from "./action-helpers";
import { assertCanPerform } from "@/lib/books/permissions";
import { writeAuditLog } from "@/lib/auth/audit";
import type { ActionState } from "@/lib/action-state";
import {
  NARRATIVE_STRUCTURES,
  narrativeStructure,
  validateNarrativePeriod,
} from "./narrative-planning";
import { tieneControlesIlegales } from "@escribiendo/shared";

class PlanningError extends Error {}

const input = z.object({
  bookId: z.uuid(),
  version: z.coerce.number().int().min(0),
  operation: z.enum(["structure", "stage", "event", "move"]),
  id: z.string().max(64).default(""),
  structure: z.enum(["FREE", "THREE_ACTS", "FIVE_ACTS", "HERO_JOURNEY"]).default("FREE"),
  stage: z.string().max(64).default(""),
  title: z.string().max(200).default(""),
  characterId: z.string().max(64).default(""),
  sectionId: z.string().max(64).default(""),
  details: z.string().max(4000).default(""),
  startsOn: z.string().max(10).default(""),
  endsOn: z.string().max(10).default(""),
  datePrecision: z.enum(["UNDATED", "EXACT", "APPROXIMATE", "YEAR"]).default("UNDATED"),
  direction: z.enum(["up", "down"]).default("up"),
});

export async function updateNarrativePlanningAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const start = await beginStoryAction();
  if (!start.ok) return start.state;
  assertCanPerform(start.session.workspace.role, "story:manage");
  const parsed = input.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { status: "error", message: "Revisa los campos del formulario." };
  const values = parsed.data;
  if ([values.title, values.details, values.stage].some(tieneControlesIlegales))
    return { status: "error", message: "El texto contiene caracteres no permitidos." };
  if (values.operation === "event") {
    const error = validateNarrativePeriod(values.startsOn, values.endsOn, values.datePrecision);
    if (error) return { status: "error", message: error };
    if (!values.title.trim() || !z.uuid().safeParse(values.characterId).success)
      return { status: "error", message: "Indica un título y el personaje del acontecimiento." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const book = await tx.book.findFirst({
        where: { id: values.bookId, workspaceId: start.session.workspace.id, deletedAt: null },
        select: { narrativeStructure: true },
      });
      if (!book) throw new PlanningError("Libro no disponible.");
      const claimed = await tx.book.updateMany({
        where: {
          id: values.bookId,
          workspaceId: start.session.workspace.id,
          deletedAt: null,
          narrativeVersion: values.version,
        },
        data: { narrativeVersion: { increment: 1 } },
      });
      if (claimed.count !== 1)
        throw new PlanningError(
          "La planificación cambió en otra pestaña. Recarga y vuelve a intentarlo.",
        );
      if (values.operation === "structure") {
        await tx.book.update({
          where: { id: values.bookId },
          data: { narrativeStructure: values.structure },
        });
        // Conservar etiquetas anteriores; el usuario puede reasignarlas, sin pérdida silenciosa.
      } else if (values.operation === "stage") {
        if (
          values.stage &&
          !(
            NARRATIVE_STRUCTURES[narrativeStructure(book.narrativeStructure)] as readonly string[]
          ).includes(values.stage)
        )
          throw new PlanningError("La etapa no pertenece a la estructura actual.");
        const saved = await tx.bookSection.updateMany({
          where: { id: values.id, bookId: values.bookId, deletedAt: null },
          data: { narrativeStage: values.stage || null },
        });
        if (saved.count !== 1) throw new PlanningError("Capítulo no disponible.");
      } else if (values.operation === "event") {
        const character = await tx.storyCharacter.findFirst({
          where: {
            id: values.characterId,
            bookId: values.bookId,
            workspaceId: start.session.workspace.id,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!character) throw new PlanningError("El personaje no pertenece al libro.");
        if (values.sectionId) {
          const section = await tx.bookSection.findFirst({
            where: { id: values.sectionId, bookId: values.bookId, deletedAt: null },
            select: { id: true },
          });
          if (!section) throw new PlanningError("El capítulo no pertenece al libro.");
        }
        const payload = {
          title: values.title.trim(),
          details: values.details.trim() || null,
          characterId: values.characterId,
          sectionId: values.sectionId || null,
          startsOn: values.startsOn || null,
          endsOn: values.endsOn || null,
          datePrecision: values.datePrecision,
          suggested: false,
        };
        if (values.id) {
          const saved = await tx.storyCharacterEvent.updateMany({
            where: {
              id: values.id,
              bookId: values.bookId,
              workspaceId: start.session.workspace.id,
            },
            data: payload,
          });
          if (saved.count !== 1) throw new PlanningError("Acontecimiento no disponible.");
        } else {
          const last = await tx.storyCharacterEvent.aggregate({
            where: { bookId: values.bookId, workspaceId: start.session.workspace.id },
            _max: { sequence: true },
          });
          await tx.storyCharacterEvent.create({
            data: {
              ...payload,
              workspaceId: start.session.workspace.id,
              bookId: values.bookId,
              sequence: (last._max.sequence ?? -1) + 1,
            },
          });
        }
      } else {
        const events = await tx.storyCharacterEvent.findMany({
          where: { bookId: values.bookId, workspaceId: start.session.workspace.id },
          orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: { id: true },
          take: 1001,
        });
        if (events.length > 1000)
          throw new PlanningError(
            "Hay demasiados acontecimientos para reordenarlos en una sola operación.",
          );
        const index = events.findIndex((event) => event.id === values.id),
          destination = index + (values.direction === "up" ? -1 : 1);
        if (index < 0 || destination < 0 || destination >= events.length)
          throw new PlanningError("El movimiento no se puede realizar.");
        [events[index], events[destination]] = [events[destination]!, events[index]!];
        for (const [sequence, event] of events.entries())
          await tx.storyCharacterEvent.update({ where: { id: event.id }, data: { sequence } });
      }
    });
    await writeAuditLog(
      {
        action: "NARRATIVE_PLANNING_UPDATED",
        entityType: "Book",
        entityId: values.bookId,
        workspaceId: start.session.workspace.id,
        actorId: start.session.user.id,
        metadata: { operation: values.operation },
      },
      start.context,
    );
    revalidatePath("/narrative");
    revalidatePath(`/books/${values.bookId}/laboratorio`);
    return { status: "success", message: "Planificación guardada." };
  } catch (error) {
    const known =
      error instanceof PlanningError ? error.message : "No se pudo guardar la planificación.";
    return { status: "error", message: known };
  }
}
