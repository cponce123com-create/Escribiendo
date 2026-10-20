"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import {
  approveBookAction,
  requestChangesAction,
  submitForReviewAction,
} from "@/lib/review/actions";
import { initialActionState } from "@/lib/action-state";
import type { BookStatus } from "@escribiendo/database";

interface ReviewActionsProps {
  bookId: string;
  status: BookStatus;
  openComments: number;
  canApprove: boolean;
  canSubmit: boolean;
}

/**
 * Flujo de revisión del libro.
 *
 * Un libro se envía a revisión, se corrigió y se aprueba. Aprobar exige que
 * no queden comentarios abiertos: es la garantía de que la edición se ha
 * tenido en cuenta.
 */
export function ReviewActions({
  bookId,
  status,
  openComments,
  canApprove,
  canSubmit,
}: ReviewActionsProps) {
  const [approval, approveAction] = useActionState(approveBookAction, initialActionState);
  const [submission, submitAction] = useActionState(submitForReviewAction, initialActionState);
  const [changes, changesAction] = useActionState(requestChangesAction, initialActionState);

  return (
    <div className="space-y-4">
      <FormMessage state={submission} />
      <FormMessage state={changes} />
      <FormMessage state={approval} />

      <div className="flex flex-wrap gap-2">
        {canSubmit && status === "IN_PROGRESS" ? (
          <form action={submitAction}>
            <input type="hidden" name="bookId" value={bookId} />
            <button type="submit" className="btn btn-secondary">
              Enviar a revisión
            </button>
          </form>
        ) : null}

        {canSubmit && status === "REVIEW" ? (
          <form action={changesAction}>
            <input type="hidden" name="bookId" value={bookId} />
            <button type="submit" className="btn btn-ghost">
              Pedir cambios
            </button>
          </form>
        ) : null}

        {canApprove && status === "REVIEW" ? (
          <form action={approveAction}>
            <input type="hidden" name="bookId" value={bookId} />
            <button type="submit" className="btn btn-primary" disabled={openComments > 0}>
              {openComments > 0
                ? `Quedan ${openComments} comentarios abiertos`
                : "Aprobar el libro"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
