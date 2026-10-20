import type { BookStatus } from "@escribiendo/database";

/**
 * Transiciones de estado de un libro.
 *
 * El estado no se cambia libremente: un libro no puede pasar de «borrador» a
 * «completo» sin pasar por la revisión, porque el estado alimenta las
 * statistics del panel y el flujo editorial.
 */
const TRANSITIONS: Record<BookStatus, BookStatus[]> = {
  DRAFT: ["IN_PROGRESS", "ARCHIVED"],
  IN_PROGRESS: ["DRAFT", "REVIEW", "ARCHIVED"],
  REVIEW: ["IN_PROGRESS", "COMPLETE", "ARCHIVED"],
  COMPLETE: ["IN_PROGRESS", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

/** Estados a los que se puede pasar desde el estado actual. */
export function availableTransitions(from: BookStatus): BookStatus[] {
  return TRANSITIONS[from];
}

/** Indica si el cambio de estado está permitido. */
export function canTransitionTo(from: BookStatus, to: BookStatus): boolean {
  if (from === to) {
    return true;
  }

  return TRANSITIONS[from].includes(to);
}
