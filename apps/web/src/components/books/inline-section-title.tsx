"use client";

import { useState } from "react";
import { StudioIcon } from "@/components/books/studio-icon";
import { initialLibraryActionState } from "@/lib/books/action-state";
import { renameSectionAction } from "@/lib/books/actions";

interface InlineSectionTitleProps {
  sectionId: string;
  title: string;
  showTitle: boolean;
  showSectionType: boolean;
  showSectionNumber: boolean;
  canEdit: boolean;
}

/**
 * Título del capítulo editable en la cabecera.
 *
 * El inspector ya permitía renombrar la sección, pero el campo quedaba a dos
 * clics y el título se leía como texto fijo. Aquí se edita en el sitio.
 *
 * Guardar el nombre no debe cambiar qué se muestra en la vista previa, así que
 * las tres opciones de composición viajan como campos ocultos con su valor
 * actual: la acción las lee del formulario y, sin ellas, las desactivaría.
 */
export function InlineSectionTitle({
  sectionId,
  title,
  showTitle,
  showSectionType,
  showSectionNumber,
  canEdit,
}: InlineSectionTitleProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // El título guardado se muestra al instante; la revalidación actualiza la prop
  // sin desmontar la edición que el usuario haya abierto después.
  const [savedTitle, setSavedTitle] = useState<{ source: string; value: string } | null>(null);
  // Una respuesta anterior optimista cede ante un título nuevo del servidor.
  // La edición abierta conserva su campo sin depender de un efecto de montaje.
  const currentTitle = savedTitle?.source === title ? savedTitle.value : title;

  if (!canEdit) {
    return <h1>{currentTitle}</h1>;
  }

  async function handleSubmit(formData: FormData) {
    const nextTitle = String(formData.get("title") ?? "").trim();

    setSaving(true);
    setError("");

    try {
      const result = await renameSectionAction(initialLibraryActionState, formData);

      if (result.status === "error") {
        setError(result.message ?? "No se pudo guardar el título.");
        return;
      }

      setSavedTitle({ source: title, value: nextTitle });
      setEditing(false);
    } catch {
      setError("No se pudo guardar el título.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <h1>
        <button
          type="button"
          className="studio-chapter-title"
          title="Renombrar el capítulo"
          onClick={() => {
            setError("");
            setEditing(true);
          }}
        >
          {currentTitle}
          <StudioIcon name="pen" className="studio-chapter-title__icon" />
        </button>
      </h1>
    );
  }

  return (
    <form action={handleSubmit} className="studio-chapter-title-form">
      <input type="hidden" name="sectionId" value={sectionId} />
      {showTitle ? <input type="hidden" name="showTitle" value="on" /> : null}
      {showSectionType ? <input type="hidden" name="showSectionType" value="on" /> : null}
      {showSectionNumber ? <input type="hidden" name="showSectionNumber" value="on" /> : null}

      <label className="sr-only" htmlFor={`section-title-inline-${sectionId}`}>
        Título del capítulo
      </label>
      <input
        id={`section-title-inline-${sectionId}`}
        name="title"
        className="studio-chapter-title-input"
        defaultValue={currentTitle}
        maxLength={300}
        required
        disabled={saving}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setError("");
          setEditing(false);
        }}
      />

      <div className="studio-chapter-title-actions">
        <button className="btn btn-secondary btn-sm" type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar título"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={saving}
          onClick={() => {
            setError("");
            setEditing(false);
          }}
        >
          Cancelar
        </button>
      </div>

      {error ? (
        <p className="studio-chapter-title-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
