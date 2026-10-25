"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { assertCanPerform } from "./permissions";
import { reviewKey } from "./laboratory-review";
import { disabledStyleRules } from "./analysis-options";
import type { ActionState } from "@/lib/action-state";
import { writeAuditLog } from "@/lib/auth/audit";
const schema = z.object({
  bookId: z.uuid(),
  legacy: z
    .array(
      z.object({
        key: z.string().max(500),
        status: z.enum(["ignored", "intentional", "resolved"]),
      }),
    )
    .max(100)
    .optional(),
  key: z.string().max(500).optional(),
  status: z.enum(["open", "ignored", "intentional", "resolved"]).optional(),
  disabledRules: z.array(z.string().max(100)).max(9).optional(),
});
export async function saveLaboratoryReviewAction(raw: unknown): Promise<ActionState> {
  let context;
  try {
    context = await assertServerActionOrigin();
  } catch {
    return { status: "error", message: "Origen no autorizado." };
  }
  const session = await getSession();
  if (!session) return { status: "error", message: "Inicia sesión para guardar la revisión." };
  try {
    assertCanPerform(session.workspace.role, "comment:create");
  } catch {
    return { status: "error", message: "No tienes permiso para guardar revisiones." };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Datos de revisión no válidos." };
  const values = parsed.data;
  if (
    values.key &&
    (!values.status ||
      !values.key.startsWith(`escribiendo:analysis-ignore:${session.user.id}:${values.bookId}:`))
  )
    return { status: "error", message: "La observación no pertenece a esta revisión." };
  if (
    values.legacy?.some(
      (item) =>
        !item.key.startsWith(`escribiendo:analysis-ignore:${session.user.id}:${values.bookId}:`),
    )
  )
    return { status: "error", message: "La revisión local contiene claves de otra cuenta." };
  const book = await prisma.book.findFirst({
    where: { id: values.bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true },
  });
  if (!book) return { status: "error", message: "Libro no disponible." };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const previous = await tx.laboratoryReviewState.findUnique({
          where: { bookId_userId: { bookId: values.bookId, userId: session.user.id } },
        });
        const decisions: Record<string, string> =
          previous?.decisions &&
          typeof previous.decisions === "object" &&
          !Array.isArray(previous.decisions)
            ? { ...(previous.decisions as Record<string, string>) }
            : {};
        if (values.key && values.status) {
          const key = reviewKey(values.key);
          decisions[key] = values.status;
        }
        for (const item of values.legacy ?? []) {
          const key = reviewKey(item.key);
          if (!(key in decisions)) decisions[key] = item.status;
        }
        if (Object.keys(decisions).length > 5000) throw new Error("REVIEW_LIMIT");
        const data = {
          decisions,
          ...(values.disabledRules
            ? { disabledRules: disabledStyleRules(values.disabledRules) }
            : {}),
        };
        if (previous) {
          const result = await tx.laboratoryReviewState.updateMany({
            where: {
              id: previous.id,
              workspaceId: session.workspace.id,
              userId: session.user.id,
              version: previous.version,
            },
            data: { ...data, version: { increment: 1 } },
          });
          if (result.count !== 1) throw new Error("REVIEW_CONFLICT");
        } else
          await tx.laboratoryReviewState.create({
            data: {
              ...data,
              workspaceId: session.workspace.id,
              bookId: values.bookId,
              userId: session.user.id,
            },
          });
      });
      await writeAuditLog(
        {
          action: "LABORATORY_REVIEW_SAVED",
          entityType: "Book",
          entityId: values.bookId,
          workspaceId: session.workspace.id,
          actorId: session.user.id,
          metadata: { kind: values.key ? "decision" : "preferences" },
        },
        context,
      );
      revalidatePath(`/books/${values.bookId}/laboratorio`);
      revalidatePath(`/books/${values.bookId}/analysis`);
      return { status: "success", message: "Revisión guardada en tu cuenta." };
    } catch (error) {
      if (error instanceof Error && error.message === "REVIEW_LIMIT")
        return {
          status: "error",
          message:
            "Has alcanzado 5.000 decisiones en este libro. Contacta al administrador para archivar decisiones antiguas.",
        };
      const retry =
        error instanceof Error &&
        (error.message === "REVIEW_CONFLICT" ||
          ("code" in error && (error.code === "P2002" || error.code === "P2034")));
      if (!retry || attempt === 2)
        return { status: "error", message: "No se pudo guardar. Recarga e inténtalo de nuevo." };
    }
  }
  return { status: "error", message: "No se pudo guardar la revisión." };
}
