"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { UsersIcon } from "@/components/icons";
import { CharacterAnalyzer } from "@/components/story/character-analyzer";
import { CharacterIntelligencePanel } from "@/components/story/character-intelligence-panel";
import { BookMentionsPanel } from "@/components/story/book-mentions-panel";
import { initialActionState } from "@/lib/action-state";
import {
  createCharacterAction,
  deleteCharacterAction,
  updateCharacterAction,
} from "@/lib/story/character-actions";
import {
  CHARACTER_ROLE_LABELS,
  CHARACTER_ROLE_OPTIONS,
  STORY_GENERAL_LABEL,
} from "@/lib/story/labels";
import type { CharacterView, StoryBookOption } from "@/lib/story/queries";
import { formatDateTime, getInitials } from "@/lib/ui/format";

interface CharacterDirectoryProps {
  books: StoryBookOption[];
  characters: CharacterView[];
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

const FICHA_FIELDS = [
  ["description", "Descripción"],
  ["personality", "Personalidad"],
  ["motivation", "Motivación"],
  ["conflict", "Conflicto"],
  ["arc", "Arco"],
  ["notes", "Notas"],
] as const;

export function CharacterDirectory({
  books,
  characters,
  canManage,
  defaultBookId = "",
  isFiltered,
}: CharacterDirectoryProps) {
  const [createState, createAction] = useActionState(createCharacterAction, initialActionState);
  const [updateState, updateAction] = useActionState(updateCharacterAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deleteCharacterAction, initialActionState);

  const bookOptions = withGeneralBook(books);

  return (
    <div className="space-y-6">
      <FormMessage state={createState} />
      <FormMessage state={updateState} />
      <FormMessage state={deleteState} />
      {canManage && defaultBookId ? (
        <CharacterAnalyzer bookId={defaultBookId} characters={characters} />
      ) : null}

      {canManage && defaultBookId ? <BookMentionsPanel bookId={defaultBookId} /> : null}

      {canManage ? (
        <section className="panel p-5" aria-labelledby="new-character-title">
          <details open={characters.length === 0 && !isFiltered}>
            <summary className="cursor-pointer font-serif text-xl text-ink">
              <span id="new-character-title">Añadir un personaje</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Una ficha para saber quién es, qué quiere y qué se lo impide. Puedes completarla poco
              a poco.
            </p>

            <form action={createAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <SelectField
                name="bookId"
                label="Libro"
                options={bookOptions}
                defaultValue={defaultBookId}
                idPrefix="new-character"
              />
              <TextField
                name="name"
                label="Nombre"
                placeholder="Elena Varela"
                error={createState.fieldErrors?.name}
                idPrefix="new-character"
              />
              <TextField
                name="aliases"
                label="Alias"
                placeholder="La Varela, doña Elena"
                hint="Separados por comas. Se usan para detectar el personaje en el manuscrito."
                required={false}
                error={createState.fieldErrors?.aliases}
                idPrefix="new-character"
              />
              <SelectField
                name="role"
                label="Papel"
                options={CHARACTER_ROLE_OPTIONS}
                defaultValue="SECONDARY"
                idPrefix="new-character"
              />
              <TextField
                name="age"
                label="Edad"
                placeholder="34"
                required={false}
                error={createState.fieldErrors?.age}
                idPrefix="new-character"
              />
              <TextField
                name="occupation"
                label="Oficio o profesión"
                placeholder="Restauradora de libros"
                required={false}
                error={createState.fieldErrors?.occupation}
                idPrefix="new-character"
              />
              <TextField
                name="summary"
                label="En una línea"
                placeholder="La persona que recuerda lo que todos quieren olvidar."
                required={false}
                error={createState.fieldErrors?.summary}
                idPrefix="new-character"
              />
              <div className="sm:col-span-2">
                <TextareaField
                  name="description"
                  label="Descripción"
                  placeholder="Apariencia, voz, manera de estar."
                  rows={3}
                  idPrefix="new-character"
                />
              </div>
              <TextareaField
                name="personality"
                label="Personalidad"
                rows={3}
                idPrefix="new-character"
              />
              <TextareaField
                name="motivation"
                label="Motivación"
                rows={3}
                idPrefix="new-character"
              />
              <TextareaField name="conflict" label="Conflicto" rows={3} idPrefix="new-character" />
              <TextareaField name="arc" label="Arco" rows={3} idPrefix="new-character" />
              <div className="sm:col-span-2">
                <TextareaField name="notes" label="Notas" rows={3} idPrefix="new-character" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton
                  label="Crear personaje"
                  pendingLabel="Guardando…"
                  className="btn btn-primary"
                />
              </div>
            </form>
          </details>
        </section>
      ) : null}

      {characters.length === 0 ? (
        <section className="panel px-6 py-12 text-center">
          <UsersIcon className="mx-auto size-8 text-ink-muted" />
          <h2 className="mt-4 font-serif text-2xl text-ink">
            {isFiltered ? "Ningún personaje coincide con el filtro." : "Todavía no hay personajes."}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {isFiltered
              ? "Prueba con otro término o quita los filtros."
              : canManage
                ? "Crea la primera ficha para empezar a construir el reparto."
                : "La creación de personajes corresponde a los roles de escritura."}
          </p>
        </section>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => (
            <article key={character.id} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="meta-label">{CHARACTER_ROLE_LABELS[character.role]}</p>
                  <h2 className="mt-1 font-serif text-xl leading-tight text-ink">
                    {character.name}
                  </h2>
                  {character.aliases.length ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      También: {character.aliases.join(", ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    {character.bookTitle ?? STORY_GENERAL_LABEL}
                    {character.age ? ` · ${character.age}` : ""}
                    {character.occupation ? ` · ${character.occupation}` : ""}
                  </p>
                </div>
                <span className="avatar shrink-0" aria-hidden="true">
                  {getInitials(character.name)}
                </span>
              </div>

              {character.summary ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{character.summary}</p>
              ) : null}

              <details className="mt-4 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-accent">
                  {canManage ? "Abrir ficha y editar" : "Abrir ficha"}
                </summary>

                {canManage ? (
                  <form action={updateAction} className="mt-3 space-y-3">
                    <input type="hidden" name="characterId" value={character.id} />
                    <SelectField
                      name="bookId"
                      label="Libro"
                      options={bookOptions}
                      defaultValue={character.bookId ?? ""}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextField
                      name="name"
                      label="Nombre"
                      defaultValue={character.name}
                      error={updateState.fieldErrors?.name}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextField
                      name="aliases"
                      label="Alias"
                      defaultValue={character.aliases.join(", ")}
                      placeholder="La Varela, doña Elena"
                      hint="Separados por comas. Se usan para detectar el personaje en el manuscrito."
                      required={false}
                      error={updateState.fieldErrors?.aliases}
                      idPrefix={`character-${character.id}`}
                    />
                    <SelectField
                      name="role"
                      label="Papel"
                      options={CHARACTER_ROLE_OPTIONS}
                      defaultValue={character.role}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextField
                      name="age"
                      label="Edad"
                      defaultValue={character.age ?? undefined}
                      required={false}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextField
                      name="occupation"
                      label="Oficio o profesión"
                      defaultValue={character.occupation ?? undefined}
                      required={false}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextField
                      name="summary"
                      label="En una línea"
                      defaultValue={character.summary ?? undefined}
                      required={false}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextareaField
                      name="description"
                      label="Descripción"
                      defaultValue={character.description}
                      rows={3}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextareaField
                      name="personality"
                      label="Personalidad"
                      defaultValue={character.personality}
                      rows={3}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextareaField
                      name="motivation"
                      label="Motivación"
                      defaultValue={character.motivation}
                      rows={3}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextareaField
                      name="conflict"
                      label="Conflicto"
                      defaultValue={character.conflict}
                      rows={3}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextareaField
                      name="arc"
                      label="Arco"
                      defaultValue={character.arc}
                      rows={3}
                      idPrefix={`character-${character.id}`}
                    />
                    <TextareaField
                      name="notes"
                      label="Notas"
                      defaultValue={character.notes}
                      rows={3}
                      idPrefix={`character-${character.id}`}
                    />
                    <SubmitButton
                      label="Guardar ficha"
                      pendingLabel="Guardando…"
                      className="btn btn-primary btn-sm"
                    />
                  </form>
                ) : (
                  <dl className="mt-3 space-y-3">
                    {FICHA_FIELDS.map(([field, label]) => {
                      const value = character[field];

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
                  Actualizado el {formatDateTime(character.updatedAt)} · {character.createdByName}
                </p>
                {character.bookId ? (
                  <CharacterIntelligencePanel
                    character={character}
                    bookId={character.bookId}
                    canManage={canManage}
                  />
                ) : null}

                {canManage ? (
                  <form action={deleteAction} className="mt-3 border-t border-line pt-3">
                    <input type="hidden" name="characterId" value={character.id} />
                    <ConfirmButton
                      label="Eliminar personaje"
                      confirmLabel="Sí, eliminar"
                      description={`Eliminar la ficha de «${character.name}»`}
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
