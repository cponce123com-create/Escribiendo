"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { BookIcon } from "@/components/icons";
import { initialActionState } from "@/lib/action-state";
import { createWorldAction, deleteWorldAction, updateWorldAction } from "@/lib/story/world-actions";
import { STORY_GENERAL_LABEL, WORLD_KIND_LABELS, WORLD_KIND_OPTIONS } from "@/lib/story/labels";
import type { StoryBookOption, WorldView } from "@/lib/story/queries";
import { formatDateTime } from "@/lib/ui/format";

interface WorldDirectoryProps {
  books: StoryBookOption[];
  worlds: WorldView[];
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

const WORLD_FIELDS = [
  ["description", "Descripción"],
  ["rules", "Reglas y funcionamiento"],
  ["notes", "Notas"],
] as const;

export function WorldDirectory({
  books,
  worlds,
  canManage,
  defaultBookId = "",
  isFiltered,
}: WorldDirectoryProps) {
  const [createState, createAction] = useActionState(createWorldAction, initialActionState);
  const [updateState, updateAction] = useActionState(updateWorldAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deleteWorldAction, initialActionState);

  const bookOptions = withGeneralBook(books);

  return (
    <div className="space-y-6">
      <FormMessage state={createState} />
      <FormMessage state={updateState} />
      <FormMessage state={deleteState} />

      {canManage ? (
        <section className="panel p-5" aria-labelledby="new-world-title">
          <details open={worlds.length === 0 && !isFiltered}>
            <summary className="cursor-pointer font-serif text-xl text-ink">
              <span id="new-world-title">Añadir un lugar o una regla del mundo</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Un escenario, una cultura, una organización o cualquier regla que sostenga la
              historia.
            </p>

            <form action={createAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <SelectField
                name="bookId"
                label="Libro"
                options={bookOptions}
                defaultValue={defaultBookId}
                idPrefix="new-world"
              />
              <TextField
                name="name"
                label="Nombre"
                placeholder="La ciudad sumergida"
                error={createState.fieldErrors?.name}
                idPrefix="new-world"
              />
              <TextField
                name="aliases"
                label="Alias"
                placeholder="La sumergida, Ys"
                hint="Separados por comas. Se usan para detectar el lugar en el manuscrito."
                required={false}
                error={createState.fieldErrors?.aliases}
                idPrefix="new-world"
              />
              <SelectField
                name="kind"
                label="Tipo"
                options={WORLD_KIND_OPTIONS}
                defaultValue="PLACE"
                idPrefix="new-world"
              />
              <TextField
                name="summary"
                label="En una línea"
                placeholder="Una ciudad que solo aparece con la marea baja."
                required={false}
                error={createState.fieldErrors?.summary}
                idPrefix="new-world"
              />
              <div className="sm:col-span-2">
                <TextareaField
                  name="description"
                  label="Descripción"
                  placeholder="Qué se ve, quién lo habita y qué se siente al llegar."
                  rows={4}
                  idPrefix="new-world"
                />
              </div>
              <div className="sm:col-span-2">
                <TextareaField
                  name="rules"
                  label="Reglas y funcionamiento"
                  placeholder="Qué puede ocurrir, qué está prohibido y qué precio tiene."
                  rows={4}
                  idPrefix="new-world"
                />
              </div>
              <div className="sm:col-span-2">
                <TextareaField name="notes" label="Notas" rows={3} idPrefix="new-world" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton
                  label="Crear entrada"
                  pendingLabel="Guardando…"
                  className="btn btn-primary"
                />
              </div>
            </form>
          </details>
        </section>
      ) : null}

      {worlds.length === 0 ? (
        <section className="panel px-6 py-12 text-center">
          <BookIcon className="mx-auto size-8 text-ink-muted" />
          <h2 className="mt-4 font-serif text-2xl text-ink">
            {isFiltered ? "Ningún mundo coincide con el filtro." : "Todavía no hay mundos."}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {isFiltered
              ? "Prueba con otro término o quita los filtros."
              : canManage
                ? "Crea la primera entrada para dar forma al escenario de la historia."
                : "La creación de mundos corresponde a los roles de escritura."}
          </p>
        </section>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {worlds.map((world) => (
            <article key={world.id} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="meta-label">{WORLD_KIND_LABELS[world.kind]}</p>
                  <h2 className="mt-1 font-serif text-xl leading-tight text-ink">{world.name}</h2>
                  {world.aliases.length ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      También: {world.aliases.join(", ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    {world.bookTitle ?? STORY_GENERAL_LABEL}
                  </p>
                </div>
                <BookIcon className="size-6 shrink-0 text-accent" aria-hidden="true" />
              </div>

              {world.summary ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{world.summary}</p>
              ) : null}

              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-accent">
                  {canManage ? "Abrir entrada y editar" : "Abrir entrada"}
                </summary>

                {canManage ? (
                  <form action={updateAction} className="mt-3 space-y-3">
                    <input type="hidden" name="worldId" value={world.id} />
                    <SelectField
                      name="bookId"
                      label="Libro"
                      options={bookOptions}
                      defaultValue={world.bookId ?? ""}
                      idPrefix={`world-${world.id}`}
                    />
                    <TextField
                      name="name"
                      label="Nombre"
                      defaultValue={world.name}
                      error={updateState.fieldErrors?.name}
                      idPrefix={`world-${world.id}`}
                    />
                    <TextField
                      name="aliases"
                      label="Alias"
                      defaultValue={world.aliases.join(", ")}
                      placeholder="La sumergida, Ys"
                      hint="Separados por comas. Se usan para detectar el lugar en el manuscrito."
                      required={false}
                      error={updateState.fieldErrors?.aliases}
                      idPrefix={`world-${world.id}`}
                    />
                    <SelectField
                      name="kind"
                      label="Tipo"
                      options={WORLD_KIND_OPTIONS}
                      defaultValue={world.kind}
                      idPrefix={`world-${world.id}`}
                    />
                    <TextField
                      name="summary"
                      label="En una línea"
                      defaultValue={world.summary ?? undefined}
                      required={false}
                      idPrefix={`world-${world.id}`}
                    />
                    <TextareaField
                      name="description"
                      label="Descripción"
                      defaultValue={world.description}
                      rows={4}
                      idPrefix={`world-${world.id}`}
                    />
                    <TextareaField
                      name="rules"
                      label="Reglas y funcionamiento"
                      defaultValue={world.rules}
                      rows={4}
                      idPrefix={`world-${world.id}`}
                    />
                    <TextareaField
                      name="notes"
                      label="Notas"
                      defaultValue={world.notes}
                      rows={3}
                      idPrefix={`world-${world.id}`}
                    />
                    <SubmitButton
                      label="Guardar entrada"
                      pendingLabel="Guardando…"
                      className="btn btn-primary btn-sm"
                    />
                  </form>
                ) : (
                  <dl className="mt-3 space-y-3">
                    {WORLD_FIELDS.map(([field, label]) => {
                      const value = world[field];

                      if (!value) {
                        return null;
                      }

                      return (
                        <div key={field}>
                          <dt className="meta-label">{label}</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                            {value}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}

                <p className="mt-3 text-xs text-ink-muted">
                  Actualizada el {formatDateTime(world.updatedAt)} · {world.createdByName}
                </p>

                {canManage ? (
                  <form action={deleteAction} className="mt-3 border-t border-line pt-3">
                    <input type="hidden" name="worldId" value={world.id} />
                    <ConfirmButton
                      label="Eliminar entrada"
                      confirmLabel="Sí, eliminar"
                      description={`Eliminar la entrada «${world.name}»`}
                      className="btn btn-ghost btn-sm text-danger hover:bg-danger/10"
                    />
                  </form>
                ) : null}
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
