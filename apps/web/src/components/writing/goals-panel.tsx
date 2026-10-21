"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { deleteGoalAction, setGoalAction } from "@/lib/writing/actions";
import { initialActionState } from "@/lib/action-state";
import { formatDate } from "@/lib/ui/format";
import type { GoalSummary } from "@/lib/writing/goals";
import { ConfirmButton } from "@/components/forms/confirm-button";

interface GoalsPanelProps {
  books: Array<{ id: string; title: string }>;
  goals: GoalSummary[];
}

/** Objetivos de palabras por periodo y su progreso. */
export function GoalsPanel({ books, goals }: GoalsPanelProps) {
  const [state, formAction] = useActionState(setGoalAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deleteGoalAction, initialActionState);

  return (
    <div className="space-y-6">
      <FormMessage state={state} />
      <FormMessage state={deleteState} />

      {goals.length > 0 ? (
        <ul className="space-y-3">
          {goals.map((goal) => (
            <li key={goal.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="meta-label">
                    {formatDate(goal.periodStart)} → {formatDate(goal.periodEnd)}
                  </p>
                  <h3 className="mt-1 font-serif text-lg text-ink">
                    {goal.bookTitle ?? "Objetivo general"}
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    {formatNumberWords(goal.wordsWritten)} de {formatNumberWords(goal.targetWords)}{" "}
                    palabras ({goal.progress} %)
                  </p>
                </div>

                <DeleteGoalButton goalId={goal.id} action={deleteAction} />
              </div>

              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/10"
                role="progressbar"
                aria-valuenow={goal.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso del objetivo: ${goal.progress} %`}
              >
                <div className="h-full bg-accent" style={{ width: `${goal.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-ink-muted">
          Todavía no hay objetivos. Define uno para medir tu avance diario o semanal.
        </p>
      )}

      <section className="panel p-6" aria-label="nuevo objetivo">
        <h3 className="font-serif text-xl text-ink">Nuevo objetivo</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          El objetivo es de palabras escritas en un periodo. Se mide con el historial de revisiones,
          así que refleja el trabajo real.
        </p>

        <form action={formAction} className="mt-5 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="periodStart"
              label="Desde"
              type="text"
              placeholder="2026-10-20"
              required={false}
              hint="Fecha de inicio (AAAA-MM-DD)."
              error={state.fieldErrors?.periodStart}
            />
            <TextField
              name="periodEnd"
              label="Hasta"
              type="text"
              placeholder="2026-10-27"
              required={false}
              hint="Fecha de fin (AAAA-MM-DD)."
              error={state.fieldErrors?.periodEnd}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="targetWords"
              label="Palabras objetivo"
              type="number"
              placeholder="2000"
              required={false}
              error={state.fieldErrors?.targetWords}
            />

            <div>
              <label className="field-label" htmlFor="goal-book">
                Libro
              </label>
              <select id="goal-book" name="bookId" className="field-input" defaultValue="">
                <option value="">Objetivo general del estudio</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SubmitButton label="Guardar objetivo" pendingLabel="Guardando…" />
        </form>
      </section>
    </div>
  );
}

function DeleteGoalButton({
  goalId,
  action,
}: {
  goalId: string;
  action: (payload: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="goalId" value={goalId} />
      <ConfirmButton
        label="Eliminar"
        confirmLabel="Sí, eliminar"
        description="Eliminar el objetivo de palabras"
      />
    </form>
  );
}

function formatNumberWords(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}
