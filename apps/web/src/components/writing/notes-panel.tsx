"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { createNoteAction, deleteNoteAction, toggleNotePinAction } from "@/lib/writing/actions";
import { initialActionState } from "@/lib/action-state";
import type { NoteSummary } from "@/lib/writing/notes";
import { formatDateTime } from "@/lib/ui/format";

interface NotesPanelProps {
  bookId: string;
  sections: Array<{ id: string; title: string }>;
  notes: NoteSummary[];
}

/**
 * Notas privadas del libro.
 *
 * Solo las ve su autora. Cada nota puede anclarse a una sección, para
 * poder dejar un apunte al lado del texto que está en marcha.
 *
 * El estado de las acciones de cada nota vive en el panel, no en la
 * tarjeta: al borrar una nota la tarjeta desaparece, y un mensaje que
 * tinggal dentro de ella se perdería con ella.
 */
export function NotesPanel({ bookId, sections, notes }: NotesPanelProps) {
  const [createState, createAction] = useActionState(createNoteAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deleteNoteAction, initialActionState);
  const [pinState, pinAction] = useActionState(toggleNotePinAction, initialActionState);

  return (
    <div className="space-y-6">
      <FormMessage state={createState} />
      <FormMessage state={deleteState} />
      <FormMessage state={pinState} />

      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif text-lg text-ink">
                  {note.isPinned ? <span aria-label="Fijada">📌 </span> : null}
                  {note.title}
                </h3>
                {note.sectionTitle ? (
                  <p className="mt-1 text-xs text-ink-muted">Anclada en «{note.sectionTitle}»</p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-2">
                <PinButton note={note} action={pinAction} />
                <DeleteButton note={note} action={deleteAction} />
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
              {note.content}
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              Actualizada el {formatDateTime(note.updatedAt)}
            </p>
          </li>
        ))}
      </ul>

      <section className="panel p-6" aria-label="Nueva nota">
        <h3 className="font-serif text-xl text-ink">Nueva nota</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Es privada: solo tú la ves. No se comparte con el resto del estudio.
        </p>

        <form action={createAction} className="mt-5 space-y-5">
          <input type="hidden" name="bookId" value={bookId} />

          <TextField
            name="title"
            label="Título de la nota"
            placeholder="Pendiente: revisar el cierre del capítulo 3"
            error={createState.fieldErrors?.title}
          />

          {sections.length > 0 ? (
            <div>
              <label className="field-label" htmlFor="note-section">
                Anclar en una sección
              </label>
              <select id="note-section" name="sectionId" className="field-input" defaultValue="">
                <option value="">Sin anclar</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="field-label" htmlFor="note-content">
              Contenido
            </label>
            <textarea
              id="note-content"
              name="content"
              className="field-input min-h-28"
              placeholder="Tu apunte de trabajo."
              aria-describedby="note-content-hint"
            />
            <p className="field-hint" id="note-content-hint">
              {createState.fieldErrors?.content ?? "Se guarda al confirmar."}
            </p>
          </div>

          <SubmitButton label="Guardar nota" pendingLabel="Guardando…" />
        </form>
      </section>
    </div>
  );
}

function PinButton({ note, action }: { note: NoteSummary; action: (payload: FormData) => void }) {
  return (
    <form action={action}>
      <input type="hidden" name="noteId" value={note.id} />
      <button
        type="submit"
        className="btn btn-ghost btn-sm"
        title={note.isPinned ? "Desfijar" : "Fijar"}
      >
        {note.isPinned ? "Desfijar" : "Fijar"}
      </button>
    </form>
  );
}

function DeleteButton({
  note,
  action,
}: {
  note: NoteSummary;
  action: (payload: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="noteId" value={note.id} />
      <button type="submit" className="btn btn-ghost btn-sm">
        Eliminar
      </button>
    </form>
  );
}
