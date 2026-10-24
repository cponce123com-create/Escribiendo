"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { initialActionState } from "@/lib/action-state";
import { updateDropCapAction } from "@/lib/editorial/template-actions";
import type { DropCapSettings } from "@/lib/editorial/template-settings";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

/**
 * Configuración única de la letra capital de la edición.
 *
 * La vista previa y la exportación leen este mismo ajuste: no hay dos
 * interruptores que puedan mostrar estados distintos.
 */
export function DropCapSettingsForm({
  bookId,
  initial,
  canManage,
}: {
  bookId: string;
  initial: DropCapSettings;
  canManage: boolean;
}) {
  const [state, action] = useActionState(updateDropCapAction, initialActionState);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [lines, setLines] = useState<DropCapSettings["lines"]>(initial.lines);

  return (
    <section className="space-y-4" aria-labelledby="drop-cap-title">
      <h2 id="drop-cap-title" className="scroll-mt-28 font-serif text-2xl">
        Letra capital
      </h2>
      <p className="text-sm text-ink-soft">
        Se compone en el primer párrafo de cada capítulo. El cuerpo, la sangría y la corrección
        vertical los calcula el motor con una sola geometría, compartida por la vista previa y el
        PDF.
      </p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="bookId" value={bookId} />
        <fieldset className="space-y-3" disabled={!canManage}>
          <legend className="sr-only">Letra capital</legend>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="block font-medium text-ink">Componer la inicial</span>
              <span className="block text-ink-muted">
                Solo afecta a los capítulos; las materias y los preliminares no la llevan.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            {([2, 3] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="lines"
                  value={value}
                  checked={lines === value}
                  onChange={() => setLines(value)}
                  className="accent-accent"
                />
                {value} líneas de cuerpo
              </label>
            ))}
          </div>
        </fieldset>
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton
            label="Guardar letra capital"
            pendingLabel="Guardando…"
            disabled={!canManage}
          />
          <Link className="text-sm underline" href={`/books/${bookId}/preview`}>
            Ver en la vista previa
          </Link>
        </div>
      </form>
    </section>
  );
}
