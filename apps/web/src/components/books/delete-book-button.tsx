"use client";

import { useActionState } from "react";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { deleteBookAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";

interface DeleteBookButtonProps {
  bookId: string;
  title: string;
}

export function DeleteBookButton({ bookId, title }: DeleteBookButtonProps) {
  const [state, formAction] = useActionState(deleteBookAction, initialLibraryActionState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookId" value={bookId} />
      <ConfirmButton
        label="Eliminar borrador"
        confirmLabel="Sí, eliminar borrador"
        description={`Eliminar el borrador «${title}»`}
        className="btn btn-ghost text-danger hover:bg-danger/10"
      />
      {state.status === "error" && state.message ? (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
