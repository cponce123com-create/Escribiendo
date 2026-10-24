"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { importBookAction } from "@/lib/books/import-actions";
import { initialLibraryActionState } from "@/lib/books/action-state";

export function BookImportForm() {
  const [state, formAction] = useActionState(importBookAction, initialLibraryActionState);
  const fileError = state.fieldErrors?.file;

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-6">
      <FormMessage state={state} />

      <div>
        <label className="field-label" htmlFor="import-file">
          Archivo del libro
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".epub,.docx,.pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          required
          className="field-input"
          aria-invalid={fileError ? true : undefined}
          aria-describedby="import-file-hint import-file-error"
        />
        <p className="field-hint" id="import-file-hint">
          EPUB, DOCX o PDF · máximo 15 MB. Se importa el texto y no se conserva el archivo original.
        </p>
        {fileError ? (
          <p className="field-error" id="import-file-error">
            {fileError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="title"
          label="Título del libro"
          placeholder="Se tomará del archivo si está disponible"
          required={false}
          error={state.fieldErrors?.title}
        />
        <TextField
          name="authorName"
          label="Autoría"
          placeholder="Se tomará del archivo si está disponible"
          required={false}
          error={state.fieldErrors?.authorName}
        />
      </div>

      <div className="panel p-4 text-sm leading-relaxed text-ink-soft">
        Los capítulos detectados quedarán como secciones editables y su contenido inicial se
        guardará en el historial de importación. Los PDF escaneados sin texto seleccionable
        necesitan OCR antes de importarse.
      </div>

      <SubmitButton label="Importar libro" pendingLabel="Leyendo y preparando el libro…" />
    </form>
  );
}
