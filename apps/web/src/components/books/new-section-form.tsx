"use client";

import { useActionState } from "react";
import { BOOK_SECTION_TYPES } from "@escribiendo/book-schema";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { createSectionAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import { SECTION_TYPE_LABELS } from "@/lib/ui/format";

interface NewSectionFormProps {
  bookId: string;
  /** Secciones que pueden actuar como padre, para anidar contenido. */
  parents: Array<{ id: string; title: string }>;
}

/** Alta de una sección dentro de un libro. */
export function NewSectionForm({ bookId, parents }: NewSectionFormProps) {
  const [state, formAction] = useActionState(createSectionAction, initialLibraryActionState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <input type="hidden" name="bookId" value={bookId} />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="title"
          label="Título de la sección"
          placeholder="Capítulo 1"
          error={state.fieldErrors?.title}
        />

        <div>
          <label className="field-label" htmlFor="field-section-type">
            Tipo
          </label>
          <select
            id="field-section-type"
            name="type"
            className="field-input"
            defaultValue="CHAPTER"
          >
            {BOOK_SECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {SECTION_TYPE_LABELS[type] ?? type}
              </option>
            ))}
          </select>
          <p className="field-hint">Determina cómo se trata la sección al maquetar.</p>
        </div>
      </div>

      {parents.length > 0 ? (
        <div>
          <label className="field-label" htmlFor="field-section-parent">
            Sección padre
          </label>
          <select id="field-section-parent" name="parentId" className="field-input" defaultValue="">
            <option value="">Sin padre (nivel superior)</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.title}
              </option>
            ))}
          </select>
          <p className="field-hint">Deja el nivel superior para capítulos y partes sueltas.</p>
        </div>
      ) : null}

      <SubmitButton label="Añadir sección" pendingLabel="Añadiendo…" />
    </form>
  );
}
