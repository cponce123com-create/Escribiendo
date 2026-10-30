import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, type SessionContext } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
export { logActionError as logStoryError } from "@/lib/action-logging";
import { errorState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import type { ZodError } from "zod";

/**
 * Punto de entrada común de las acciones de las herramientas de historia.
 *
 * Comprueba el origen, la sesión y el permiso de escritura. Un `REVIEWER`
 * puede leer la biblia de la historia, pero no modificarla.
 */
export type StoryActionStart =
  | { ok: true; session: SessionContext; context: RequestContext }
  | { ok: false; state: ActionState };

export async function beginStoryAction(): Promise<StoryActionStart> {
  let context: RequestContext;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return { ok: false, state: errorState("No se ha podido validar la solicitud.") };
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!canPerform(session.workspace.role, "story:manage")) {
    return {
      ok: false,
      state: errorState("No tienes permisos para modificar las herramientas de historia."),
    };
  }

  return { ok: true, session, context };
}

/** Comprueba que un libro opcional pertenece al estudio de la sesión. */
export async function storyBookExists(
  session: SessionContext,
  bookId: string | null,
): Promise<boolean> {
  if (!bookId) {
    return true;
  }

  const book = await prisma.book.findFirst({
    where: {
      id: bookId,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true },
  });

  return Boolean(book);
}

export function revalidateStoryPaths(path: string, bookIds: Array<string | null> = []): void {
  revalidatePath(path);

  for (const bookId of new Set(bookIds.filter((value): value is string => Boolean(value)))) {
    revalidatePath(`/books/${bookId}`);
  }
}

/** Convierte los errores de Zod en el mapa que espera el formulario. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}
