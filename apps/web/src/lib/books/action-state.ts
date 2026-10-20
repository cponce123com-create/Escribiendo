import type { ActionState } from "@/lib/action-state";

/**
 * Estado de las acciones de la biblioteca.
 *
 * Reexporta el estado genérico de la aplicación para no duplicar el tipo.
 */
export type LibraryActionState = ActionState;

export const initialLibraryActionState: ActionState = { status: "idle" };
