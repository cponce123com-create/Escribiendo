"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/forms/dialog";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { createNoteAction } from "@/lib/writing/actions";
import { initialActionState } from "@/lib/action-state";
import type { NoteSummary } from "@/lib/writing/notes";
import { formatDateTime } from "@/lib/ui/format";
import { StudioIcon } from "./studio-icon";

const TABS = ["Historial", "Notas", "Detalles"] as const;

export function StudioInspector({
  history,
  details,
  bookId,
  sectionId,
  notes,
}: {
  history: ReactNode;
  details: ReactNode;
  bookId: string;
  sectionId: string;
  notes: NoteSummary[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Historial");
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const [state, action] = useActionState(
    async (previous: typeof initialActionState, data: FormData) => {
      const result = await createNoteAction(previous, data);
      if (result.status === "success") {
        setAdding(false);
        router.refresh();
      }
      return result;
    },
    initialActionState,
  );
  const historyHref = `/books/${bookId}/sections/${sectionId}/history`;
  return (
    <aside className="studio-inspector" aria-label="Panel editorial">
      <div className="studio-tabs" role="tablist" aria-label="Información editorial">
        {TABS.map((label, index) => (
          <button
            key={label}
            id={`studio-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={tab === label}
            aria-controls={`studio-panel-${index}`}
            tabIndex={tab === label ? 0 : -1}
            onClick={() => setTab(label)}
            onKeyDown={(event) => {
              let next: number | undefined;
              if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
              if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = TABS.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                setTab(TABS[next]!);
                document.getElementById(`studio-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`studio-panel-${TABS.indexOf(tab)}`}
        role="tabpanel"
        aria-labelledby={`studio-tab-${TABS.indexOf(tab)}`}
        tabIndex={0}
      >
        {tab === "Historial" ? (
          <section className="studio-card studio-revisions">
            <header>
              <h2>Revisiones</h2>
              <Link href={historyHref}>
                Ver todas <span aria-hidden="true">→</span>
              </Link>
            </header>
            {history}
            <Link href={historyHref} className="studio-compare">
              <StudioIcon name="compare" />
              Comparar versiones
            </Link>
          </section>
        ) : null}
        {tab === "Detalles" ? (
          <section className="studio-card">
            <header>
              <h2>Detalles del capítulo</h2>
            </header>
            {details}
          </section>
        ) : null}
        {tab === "Historial" ? (
          <section className="studio-card studio-assistant" aria-label="Asistente de escritura IA">
            <header>
              <h2>Asistente de escritura IA</h2>
              <span className="studio-beta">BETA</span>
            </header>
            <div className="studio-suggestion">
              <StudioIcon name="bulb" />
              <div>
                <h3>Sugerencia de estilo</h3>
                <p>Conecta un servicio de IA para recibir sugerencias sobre tu escritura.</p>
                <button type="button" disabled title="Pendiente de conectar un proveedor de IA">
                  Aplicar sugerencia
                </button>
                <small>Pendiente de configurar</small>
              </div>
            </div>
          </section>
        ) : null}
        {tab !== "Detalles" ? (
          <section className="studio-card studio-notes">
            <header>
              <h2>Notas rápidas</h2>
              <button type="button" className="studio-add-note" onClick={() => setAdding(true)}>
                <StudioIcon name="plus" /> Añadir
              </button>
            </header>
            {notes.length ? (
              <ul>
                {notes.slice(0, tab === "Notas" ? notes.length : 3).map((note, index) => (
                  <li key={note.id}>
                    <span
                      className={`studio-note-dot studio-note-dot--${index % 3}`}
                      aria-hidden="true"
                    />
                    <div>
                      <h3>{note.title}</h3>
                      <p>{note.content}</p>
                      <time dateTime={new Date(note.updatedAt).toISOString()}>
                        {formatDateTime(note.updatedAt)}
                      </time>
                    </div>
                    <Link
                      href={`/books/${bookId}/notes`}
                      aria-label={`Gestionar nota: ${note.title}`}
                      title="Gestionar nota"
                    >
                      ⋮
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="studio-empty">
                Guarda aquí tus ideas, recordatorios y apuntes para este capítulo.
              </p>
            )}
            <Link className="studio-all-notes" href={`/books/${bookId}/notes`}>
              Ver todas las notas →
            </Link>
          </section>
        ) : null}
      </div>
      {adding ? (
        <Dialog
          abierto
          titulo="Nueva nota rápida"
          descripcion="Esta nota es privada y quedará vinculada al capítulo abierto."
          onCerrar={() => setAdding(false)}
        >
          <form action={action} className="space-y-4">
            <FormMessage state={state} />
            <input type="hidden" name="bookId" value={bookId} />
            <input type="hidden" name="sectionId" value={sectionId} />
            <label className="field-label" htmlFor="studio-note-title">
              Título de la nota
            </label>
            <input
              className="field-input"
              id="studio-note-title"
              name="title"
              required
              maxLength={200}
            />
            <label className="field-label" htmlFor="studio-note-content">
              Contenido
            </label>
            <textarea
              className="field-input min-h-28"
              id="studio-note-content"
              name="content"
              required
            />
            <SubmitButton label="Guardar nota" pendingLabel="Guardando…" />
          </form>
        </Dialog>
      ) : null}
    </aside>
  );
}
