"use client";

import Link from "next/link";
import { useActionState, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/forms/dialog";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { createNoteAction } from "@/lib/writing/actions";
import { initialActionState } from "@/lib/action-state";
import type { NoteSummary } from "@/lib/writing/notes";
import { formatDateTime } from "@/lib/ui/format";
import { StudioIcon } from "./studio-icon";
import { ManuscriptSearchPanel } from "@/components/books/manuscript-search-panel";
import { InspectorPanelContext } from "@/components/books/manuscript-workspace";

const TABS = ["Buscar", "Historial", "Notas", "Detalles"] as const;

export function StudioInspector({
  history,
  details,
  bookId,
  sectionId,
  notes,
  canEdit,
}: {
  history: ReactNode;
  details: ReactNode;
  bookId: string;
  sectionId: string;
  notes: NoteSummary[];
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Buscar");
  const { collapsed: panelCollapsed, toggle: togglePanel } = useContext(InspectorPanelContext);
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
    <aside
      id="studio-editorial-panel"
      className={`studio-inspector ${panelCollapsed ? "studio-inspector--collapsed" : ""}`}
      aria-label="Panel editorial"
      data-collapsed={panelCollapsed}
    >
      <button
        type="button"
        className="studio-inspector-restore"
        aria-label="Mostrar panel editorial"
        aria-expanded={false}
        onClick={togglePanel}
        title="Mostrar panel editorial"
      >
        <StudioIcon name="chevrons" />
      </button>
      <header className="studio-inspector-header">
        <span>Panel editorial</span>
        <button
          type="button"
          aria-label="Ocultar panel editorial"
          aria-expanded={true}
          onClick={togglePanel}
          title="Ocultar panel editorial"
        >
          <StudioIcon name="chevrons" />
        </button>
      </header>
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
        {tab === "Buscar" ? <ManuscriptSearchPanel bookId={bookId} canEdit={canEdit} /> : null}
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
        {tab === "Notas" ? (
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
