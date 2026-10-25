"use client";
import { useState, useTransition } from "react";
import { saveLaboratoryReviewAction } from "@/lib/books/laboratory-review-actions";
import type { ActionState } from "@/lib/action-state";
import { FormMessage } from "@/components/forms/form-message";
export function SaveAnalysisPreferences({ bookId }: { bookId: string }) {
  const [pending, start] = useTransition(),
    [state, setState] = useState<ActionState>({ status: "idle" });
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={(event) => {
          const form = event.currentTarget.closest("form");
          if (!form) return;
          const fields = new FormData(form),
            disabledRules = fields
              .getAll("disableRule")
              .filter((value): value is string => typeof value === "string");
          start(async () => {
            setState(await saveLaboratoryReviewAction({ bookId, disabledRules }));
          });
        }}
      >
        {pending ? "Guardando…" : "Guardar reglas en mi cuenta"}
      </button>
      <FormMessage state={state} />
    </div>
  );
}
