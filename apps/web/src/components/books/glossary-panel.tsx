"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { initialActionState } from "@/lib/action-state";
import {
  createGlossaryTermAction,
  deleteGlossaryTermAction,
  syncGlossarySectionAction,
  updateGlossaryTermAction,
} from "@/lib/books/glossary-actions";

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
}

interface GlossaryPanelProps {
  bookId: string;
  terms: GlossaryTerm[];
  hasSection: boolean;
  sectionId: string | null;
}

function GlossaryTermRow({ bookId, term }: { bookId: string; term: GlossaryTerm }) {
  const [state, formAction, pending] = useActionState(updateGlossaryTermAction, initialActionState);

  return (
    <li className="rounded-lg border border-line p-3">
      <details>
        <summary className="cursor-pointer">
          <span className="font-semibold text-ink">{term.term}</span>
          <span className="ml-2 text-sm text-ink-muted">{term.definition}</span>
        </summary>

        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={term.id} />
          <input type="hidden" name="bookId" value={bookId} />
          <div>
            <label className="field-label" htmlFor={`term-${term.id}`}>
              Término
            </label>
            <input
              id={`term-${term.id}`}
              name="term"
              className="field-input"
              defaultValue={term.term}
              maxLength={160}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`definition-${term.id}`}>
              Definición
            </label>
            <textarea
              id={`definition-${term.id}`}
              name="definition"
              className="field-input min-h-24"
              defaultValue={term.definition}
              maxLength={2000}
              required
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? "Guardando…" : "Guardar término"}
            </button>
            <FormMessage state={state} />
          </div>
        </form>

        <form action={deleteGlossaryTermAction} className="mt-3">
          <input type="hidden" name="id" value={term.id} />
          <input type="hidden" name="bookId" value={bookId} />
          <button type="submit" className="btn btn-danger btn-sm">
            Eliminar término
          </button>
        </form>
      </details>
    </li>
  );
}

export function GlossaryPanel({ bookId, terms, hasSection, sectionId }: GlossaryPanelProps) {
  const [createState, createAction, creating] = useActionState(
    createGlossaryTermAction,
    initialActionState,
  );
  const [syncState, syncAction, syncing] = useActionState(
    syncGlossarySectionAction,
    initialActionState,
  );

  return (
    <div className="space-y-5">
      <form className="panel space-y-4 p-5" action={createAction}>
        <h2 className="font-serif text-xl text-ink">Añadir término</h2>
        <input type="hidden" name="bookId" value={bookId} />
        <div>
          <label className="field-label" htmlFor="new-term">
            Término
          </label>
          <input
            id="new-term"
            name="term"
            className="field-input"
            maxLength={160}
            required
            placeholder="Zeugma"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="new-definition">
            Definición
          </label>
          <textarea
            id="new-definition"
            name="definition"
            className="field-input min-h-24"
            maxLength={2000}
            required
            placeholder="Figura que omite una palabra sobreentendida."
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
            {creating ? "Añadiendo…" : "Añadir término"}
          </button>
          <FormMessage state={createState} />
        </div>
      </form>

      <section className="panel space-y-4 p-5" aria-labelledby="glossary-terms-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="glossary-terms-title" className="font-serif text-xl text-ink">
            Términos
          </h2>
          <span className="text-xs text-ink-muted">
            {terms.length} {terms.length === 1 ? "término" : "términos"}
          </span>
        </div>

        {terms.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Todavía no hay términos. Añade el primero para empezar el glosario.
          </p>
        ) : (
          <ul className="space-y-2">
            {terms.map((term) => (
              <GlossaryTermRow key={term.id} bookId={bookId} term={term} />
            ))}
          </ul>
        )}
      </section>

      <form className="panel space-y-3 p-5" action={syncAction}>
        <h2 className="font-serif text-xl text-ink">Sección del manuscrito</h2>
        <input type="hidden" name="bookId" value={bookId} />
        <p className="text-sm leading-relaxed text-ink-soft">
          {hasSection
            ? "La sección de glosario ya existe. Actualízala para volcar los términos actuales; se guarda una revisión antes de cambiar el contenido."
            : "Crea una sección GLOSSARY al final del libro con los términos ordenados alfabéticamente."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn btn-secondary btn-sm"
            disabled={syncing || terms.length === 0}
          >
            {syncing
              ? "Actualizando…"
              : hasSection
                ? "Actualizar sección de glosario"
                : "Crear sección de glosario"}
          </button>
          {sectionId ? (
            <Link className="btn btn-ghost btn-sm" href={`/books/${bookId}/sections/${sectionId}`}>
              Abrir sección
            </Link>
          ) : null}
          <FormMessage state={syncState} />
        </div>
      </form>
    </div>
  );
}
