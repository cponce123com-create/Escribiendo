"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { createBookAction, updateBookAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import type { BookMetadataInput } from "@escribiendo/book-schema";

interface BookFormProps {
  mode: "create" | "edit";
  bookId?: string;
  initialValues?: Partial<BookMetadataInput>;
}

/**
 * Formulario de metadatos del libro.
 *
 * El mismo formulario sirve para crear y para editar: la única diferencia es
 * la acción que se invoca y el identificador que se envía.
 */
export function BookForm({ mode, bookId, initialValues }: BookFormProps) {
  const action = mode === "create" ? createBookAction : updateBookAction;
  const [state, formAction] = useActionState(action, initialLibraryActionState);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />

      {bookId ? <input type="hidden" name="bookId" value={bookId} /> : null}

      <TextField
        name="title"
        label="Título"
        placeholder="El título de la obra"
        defaultValue={initialValues?.title ?? ""}
        error={state.fieldErrors?.title}
      />

      <TextField
        name="subtitle"
        label="Subtítulo"
        placeholder="Un subtítulo quesitúa la obra"
        defaultValue={initialValues?.subtitle ?? ""}
        required={false}
        error={state.fieldErrors?.subtitle}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="authorName"
          label="Autoría"
          placeholder="Nombre tal como se firma"
          defaultValue={initialValues?.authorName ?? ""}
          error={state.fieldErrors?.authorName}
        />

        <TextField
          name="penName"
          label="Nombre de pluma"
          placeholder="Si se publica bajo otro nombre"
          defaultValue={initialValues?.penName ?? ""}
          required={false}
          error={state.fieldErrors?.penName}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          name="genre"
          label="Género"
          placeholder="Narrativa, ensayo…"
          defaultValue={initialValues?.genre ?? ""}
          required={false}
          error={state.fieldErrors?.genre}
        />

        <TextField
          name="language"
          label="Idioma"
          type="text"
          defaultValue={initialValues?.language ?? "es"}
          hint="Código ISO, por ejemplo «es»."
          error={state.fieldErrors?.language}
        />

        <TextField
          name="targetWordCount"
          label="Objetivo de palabras"
          type="number"
          placeholder="80000"
          defaultValue={initialValues?.targetWordCount?.toString() ?? ""}
          required={false}
          hint="Opcional. Habilita el cálculo de progreso."
          error={state.fieldErrors?.targetWordCount}
        />
      </div>

      <div>
        <label className="field-label" htmlFor="field-description">
          Sinopsis
        </label>
        <textarea
          id="field-description"
          name="description"
          className="field-input min-h-32"
          placeholder="Una sinopsis breve para la ficha del libro."
          defaultValue={initialValues?.description ?? ""}
          aria-describedby="field-description-hint"
        />
        <p className="field-hint" id="field-description-hint">
          Se muestra en la ficha del libro. No es el texto de la cubierta.
        </p>
        {state.fieldErrors?.description ? (
          <p className="field-error">{state.fieldErrors.description}</p>
        ) : null}
      </div>

      <SubmitButton
        label={mode === "create" ? "Crear libro" : "Guardar cambios"}
        pendingLabel={mode === "create" ? "Creando…" : "Guardando…"}
      />
    </form>
  );
}
