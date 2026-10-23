"use client";
import { useActionState } from "react";
import { updateEditionTocAction } from "@/lib/layout/actions";
import { initialActionState } from "@/lib/action-state";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

export function EditionTocForm({
  bookId,
  depth,
  front,
  back,
}: {
  bookId: string;
  depth: string | null;
  front: boolean;
  back: boolean;
}) {
  const [state, action] = useActionState(updateEditionTocAction, initialActionState);
  return (
    <form action={action} className="panel space-y-4 p-5" aria-label="Configuración del índice">
      <input type="hidden" name="bookId" value={bookId} />
      <FormMessage state={state} />
      <label className="field-label" htmlFor="toc-depth">
        Profundidad del índice
      </label>
      <select
        className="field-input"
        id="toc-depth"
        name="tocDepth"
        defaultValue={depth ?? "chapters-h1"}
      >
        <option value="parts-chapters">Partes y capítulos</option>
        <option value="chapters-h1">Capítulos y subtítulos de nivel 1</option>
        <option value="chapters-h1-h2">Hasta subtítulos de nivel 2</option>
        <option value="chapters-h1-h2-h3">Hasta subtítulos de nivel 3</option>
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="tocIncludeFrontMatter" defaultChecked={front} />
        Incluir preliminares
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="tocIncludeBackMatter" defaultChecked={back} />
        Incluir páginas finales
      </label>
      <SubmitButton label="Guardar índice" pendingLabel="Guardando…" />
    </form>
  );
}
