"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { initialActionState } from "@/lib/action-state";
import {
  createPlanItemAction,
  deletePlanItemAction,
  updatePlanItemAction,
  updatePlanStatusAction,
} from "@/lib/story/planning-actions";
import {
  PLAN_KIND_LABELS,
  PLAN_KIND_OPTIONS,
  PLAN_STATUS_DESCRIPTIONS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_OPTIONS,
  PLAN_STATUS_VALUES,
  STORY_GENERAL_LABEL,
} from "@/lib/story/labels";
import type { PlanItemView, StoryBookOption } from "@/lib/story/queries";
import { formatDateTime } from "@/lib/ui/format";

interface PlanningBoardProps {
  books: StoryBookOption[];
  items: PlanItemView[];
  canManage: boolean;
  defaultBookId?: string;
  isFiltered: boolean;
}

function withGeneralBook(books: StoryBookOption[]): Array<{ value: string; label: string }> {
  return [
    { value: "", label: STORY_GENERAL_LABEL },
    ...books.map((book) => ({ value: book.id, label: book.title })),
  ];
}

export function PlanningBoard({
  books,
  items,
  canManage,
  defaultBookId = "",
  isFiltered,
}: PlanningBoardProps) {
  const [createState, createAction] = useActionState(createPlanItemAction, initialActionState);
  const [updateState, updateAction] = useActionState(updatePlanItemAction, initialActionState);
  const [statusState, statusAction] = useActionState(updatePlanStatusAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deletePlanItemAction, initialActionState);

  const bookOptions = withGeneralBook(books);

  return (
    <div className="space-y-6">
      <FormMessage state={createState} />
      <FormMessage state={updateState} />
      <FormMessage state={statusState} />
      <FormMessage state={deleteState} />

      {canManage ? (
        <section className="panel p-5" aria-labelledby="new-plan-item-title">
          <details open={items.length === 0 && !isFiltered}>
            <summary className="cursor-pointer font-serif text-xl text-ink">
              <span id="new-plan-item-title">Añadir una idea al plan</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Una escena, un giro o una idea suelta. Puedes vincularla a un libro o dejarla como
              material general del estudio.
            </p>

            <form action={createAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <SelectField
                name="bookId"
                label="Libro"
                options={bookOptions}
                defaultValue={defaultBookId}
                idPrefix="new-plan"
              />
              <TextField
                name="title"
                label="Título de la idea"
                placeholder="El reencuentro en el puerto"
                error={createState.fieldErrors?.title}
                idPrefix="new-plan"
              />
              <SelectField
                name="kind"
                label="Tipo"
                options={PLAN_KIND_OPTIONS}
                defaultValue="SCENE"
                idPrefix="new-plan"
              />
              <SelectField
                name="status"
                label="Estado"
                options={PLAN_STATUS_OPTIONS}
                defaultValue="IDEA"
                idPrefix="new-plan"
              />
              <div className="sm:col-span-2">
                <TextareaField
                  name="summary"
                  label="Resumen"
                  placeholder="Qué ocurre, qué cambia y por qué importa."
                  error={createState.fieldErrors?.summary}
                  rows={4}
                  idPrefix="new-plan"
                />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton
                  label="Añadir idea"
                  pendingLabel="Guardando…"
                  className="btn btn-primary"
                />
              </div>
            </form>
          </details>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_STATUS_VALUES.map((status) => {
          const bucket = items.filter((item) => item.status === status);

          return (
            <section key={status} className="panel p-3" aria-labelledby={`plan-status-${status}`}>
              <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                <h2 id={`plan-status-${status}`} className="font-serif text-lg text-ink">
                  {PLAN_STATUS_LABELS[status]}
                </h2>
                <span className="phase-chip phase-chip-static">{bucket.length}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {PLAN_STATUS_DESCRIPTIONS[status]}
              </p>

              <div className="mt-3 space-y-3">
                {bucket.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-line px-3 py-6 text-center text-xs text-ink-muted">
                    Nada en esta columna.
                  </p>
                ) : (
                  bucket.map((item) => (
                    <PlanCard
                      key={item.id}
                      item={item}
                      books={bookOptions}
                      canManage={canManage}
                      updateAction={updateAction}
                      statusAction={statusAction}
                      deleteAction={deleteAction}
                      updateState={updateState}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface PlanCardProps {
  item: PlanItemView;
  books: Array<{ value: string; label: string }>;
  canManage: boolean;
  updateAction: (payload: FormData) => void;
  statusAction: (payload: FormData) => void;
  deleteAction: (payload: FormData) => void;
  updateState: typeof initialActionState;
}

function PlanCard({
  item,
  books,
  canManage,
  updateAction,
  statusAction,
  deleteAction,
  updateState,
}: PlanCardProps) {
  return (
    <article className="rounded-sm border border-line bg-surface/75 p-3">
      <p className="meta-label">{PLAN_KIND_LABELS[item.kind]}</p>
      <h3 className="mt-1 font-serif text-lg leading-snug text-ink">{item.title}</h3>
      <p className="mt-1 text-xs text-ink-muted">
        {item.bookTitle ?? STORY_GENERAL_LABEL} · {item.createdByName}
      </p>

      {item.summary ? (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
          {item.summary}
        </p>
      ) : null}

      {canManage ? (
        <form action={statusAction} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="itemId" value={item.id} />
          <label className="sr-only" htmlFor={`plan-status-${item.id}`}>
            Cambiar estado de «{item.title}»
          </label>
          <select
            id={`plan-status-${item.id}`}
            name="status"
            className="field-input text-xs"
            defaultValue={item.status}
          >
            {PLAN_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost btn-sm">
            Mover
          </button>
        </form>
      ) : null}

      <details className="mt-3 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-accent">
          {canManage ? "Editar idea" : "Ver detalle"}
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          Actualizada el {formatDateTime(item.updatedAt)}
        </p>

        {canManage ? (
          <>
            <form action={updateAction} className="mt-3 space-y-3">
              <input type="hidden" name="itemId" value={item.id} />
              <SelectField
                name="bookId"
                label="Libro"
                options={books}
                defaultValue={item.bookId ?? ""}
                idPrefix={`plan-${item.id}`}
              />
              <TextField
                name="title"
                label="Título"
                defaultValue={item.title}
                error={updateState.fieldErrors?.title}
                idPrefix={`plan-${item.id}`}
              />
              <SelectField
                name="kind"
                label="Tipo"
                options={PLAN_KIND_OPTIONS}
                defaultValue={item.kind}
                idPrefix={`plan-${item.id}`}
              />
              <SelectField
                name="status"
                label="Estado"
                options={PLAN_STATUS_OPTIONS}
                defaultValue={item.status}
                idPrefix={`plan-${item.id}`}
              />
              <TextareaField
                name="summary"
                label="Resumen"
                defaultValue={item.summary}
                rows={4}
                idPrefix={`plan-${item.id}`}
              />
              <SubmitButton
                label="Guardar cambios"
                pendingLabel="Guardando…"
                className="btn btn-primary btn-sm"
              />
            </form>

            <form action={deleteAction} className="mt-4 border-t border-line pt-3">
              <input type="hidden" name="itemId" value={item.id} />
              <ConfirmButton
                label="Eliminar idea"
                confirmLabel="Sí, eliminar"
                description={`Eliminar la idea «${item.title}»`}
                className="btn btn-ghost btn-sm text-danger hover:bg-danger/10"
              />
            </form>
          </>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
            {item.summary ?? "Sin resumen."}
          </p>
        )}
      </details>
    </article>
  );
}
