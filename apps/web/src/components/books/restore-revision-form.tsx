"use client";

import { useActionState } from "react";
import { restoreRevisionAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

export function RestoreRevisionForm({
  sectionId,
  revisionId,
}: {
  sectionId: string;
  revisionId: string;
}) {
  const [state, action] = useActionState(restoreRevisionAction, initialLibraryActionState);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <FormMessage state={state} />
      <SubmitButton label="Restaurar" pendingLabel="Restaurando…" />
    </form>
  );
}
