"use client";

import { useActionState } from "react";
import { renameSectionAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";

interface SectionTitleFormProps {
  sectionId: string;
  title: string;
  showTitle: boolean;
  showSectionType: boolean;
  showSectionNumber: boolean;
  canEdit: boolean;
}

/**
 * Edicion del titulo editorial de una seccion.
 *
 * El titulo no es una etiqueta de navegacion: se guarda en la seccion y se
 * inserta en la vista previa, el PDF, el EPUB, el DOCX y el indice.
 */
export function SectionTitleForm({
  sectionId,
  title,
  showTitle,
  showSectionType,
  showSectionNumber,
  canEdit,
}: SectionTitleFormProps) {
  const [state, formAction, pending] = useActionState(
    renameSectionAction,
    initialLibraryActionState,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="sectionId" value={sectionId} />
      <label className="field-label" htmlFor="section-title">
        Título en el libro
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="section-title"
          name="title"
          className="field-input max-w-xl"
          defaultValue={title}
          maxLength={300}
          required
          disabled={!canEdit || pending}
        />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={!canEdit || pending}>
          {pending ? "Guardando…" : "Guardar título"}
        </button>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-3" disabled={!canEdit || pending}>
        <legend className="field-label">Qué se muestra</legend>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="showTitle" defaultChecked={showTitle} />
          Título
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="showSectionType" defaultChecked={showSectionType} />
          Tipo de sección
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="showSectionNumber" defaultChecked={showSectionNumber} />
          Número
        </label>
      </fieldset>
      <p className="field-hint">
        Aparece al abrir la sección y en el índice. Si el manuscrito ya empieza con el mismo
        encabezado, no se duplica.
      </p>
      {state.status === "error" ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : state.status === "success" ? (
        <p className="text-sm text-success" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
