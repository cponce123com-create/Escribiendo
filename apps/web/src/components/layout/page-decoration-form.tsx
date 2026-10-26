"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { initialActionState } from "@/lib/action-state";
import { updateEditionDecorationAction } from "@/lib/layout/actions";
import type { EditionDecoration } from "@/lib/layout/decoration";

interface PageDecorationFormProps {
  bookId: string;
  decoration: EditionDecoration;
}

const CAJAS = [
  { position: "top-left", field: "boxTopLeft", label: "Superior izquierda" },
  { position: "top-center", field: "boxTopCenter", label: "Superior centro" },
  { position: "top-right", field: "boxTopRight", label: "Superior derecha" },
  { position: "bottom-left", field: "boxBottomLeft", label: "Inferior izquierda" },
  { position: "bottom-center", field: "boxBottomCenter", label: "Inferior centro" },
  { position: "bottom-right", field: "boxBottomRight", label: "Inferior derecha" },
] as const;

/**
 * Decoración de página de la edición.
 *
 * Solo cambia folio, numeración y cajas base; el resto se hereda de la
 * plantilla. Dejar un campo vacío mantiene el valor heredado.
 */
export function PageDecorationForm({ bookId, decoration }: PageDecorationFormProps) {
  const [state, formAction, pending] = useActionState(
    updateEditionDecorationAction,
    initialActionState,
  );

  return (
    <section className="panel p-5" aria-labelledby="page-decoration-title">
      <h2 id="page-decoration-title" className="font-serif text-xl text-ink">
        Decoración de página
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Folio, numeración y cajas de margen de esta edición. Lo que dejes vacío se hereda de la
        plantilla editorial.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="bookId" value={bookId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="folioPosition">
              Posición del folio
            </label>
            <select
              id="folioPosition"
              name="folioPosition"
              className="field-input"
              defaultValue={decoration.folioPosition ?? ""}
            >
              <option value="">Heredar de la plantilla</option>
              <option value="bottomCenter">Pie centrado</option>
              <option value="bottomOuter">Pie exterior</option>
              <option value="topOuter">Cabecera exterior</option>
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="pageNumbering">
              Numeración
            </label>
            <select
              id="pageNumbering"
              name="pageNumbering"
              className="field-input"
              defaultValue={decoration.pageNumbering ?? ""}
            >
              <option value="">Heredar de la plantilla</option>
              <option value="arabic">Arábiga (1, 2, 3)</option>
              <option value="roman-lower">Romana minúscula (i, ii, iii)</option>
              <option value="roman-upper">Romana mayúscula (I, II, III)</option>
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="field-label">Cajas de margen</legend>
          <p className="field-hint">
            Tokens disponibles: {"{libro}"}, {"{autor}"}, {"{capitulo}"}, {"{folio}"} y{" "}
            {"{paginas}"}.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {CAJAS.map((caja) => (
              <div key={caja.position}>
                <label className="field-label" htmlFor={caja.field}>
                  {caja.label}
                </label>
                <input
                  id={caja.field}
                  name={caja.field}
                  className="field-input"
                  maxLength={200}
                  defaultValue={decoration.marginBoxes?.[caja.position] ?? ""}
                  placeholder="Heredar"
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "Guardando…" : "Guardar decoración"}
          </button>
          <FormMessage state={state} />
        </div>
      </form>
    </section>
  );
}
