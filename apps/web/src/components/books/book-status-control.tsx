"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changeBookStatusAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import { availableTransitions } from "@/lib/books/status";
import { BOOK_STATUS_LABELS } from "@/lib/ui/format";
import type { BookStatus } from "@escribiendo/database";

interface BookStatusControlProps {
  bookId: string;
  status: BookStatus;
}

function StatusSubmit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
      {pending ? "Cambiando…" : "Cambiar estado"}
    </button>
  );
}

/**
 * Cambio de estado del libro.
 *
 * Solo se ofrecen las transiciones permitidas: el servidor vuelve a
 * comprobarlas, esta interfaz solo evita ofrecer lo imposible.
 */
export function BookStatusControl({ bookId, status }: BookStatusControlProps) {
  const [state, formAction] = useActionState(changeBookStatusAction, initialLibraryActionState);
  const transitions = availableTransitions(status);

  if (transitions.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="bookId" value={bookId} />

      <label className="sr-only" htmlFor="book-status-select">
        Nuevo estado
      </label>
      <select
        id="book-status-select"
        name="status"
        className="field-input w-auto"
        defaultValue={transitions[0]}
      >
        {transitions.map((transition) => (
          <option key={transition} value={transition}>
            {BOOK_STATUS_LABELS[transition] ?? transition}
          </option>
        ))}
      </select>

      <span className="text-xs text-ink-muted">Ahora: {BOOK_STATUS_LABELS[status] ?? status}</span>

      <StatusSubmit />

      {state.status === "error" && state.message ? (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}

      {state.status === "success" && state.message ? (
        <span className="text-xs text-success" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
