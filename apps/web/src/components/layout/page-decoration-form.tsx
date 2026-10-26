"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { initialActionState } from "@/lib/action-state";
import { updateEditionDecorationAction } from "@/lib/layout/actions";
import type { EditionDecoration } from "@/lib/layout/decoration";

interface PageDecorationFormProps {
  bookId: string;
  decoration: EditionDecoration;
}

const CAJAS = [
  { position: "top-left-corner", field: "boxTopLeftCorner", label: "Esquina superior izquierda" },
  { position: "top-left", field: "boxTopLeft", label: "Superior izquierda" },
  { position: "top-center", field: "boxTopCenter", label: "Superior centro" },
  { position: "top-right", field: "boxTopRight", label: "Superior derecha" },
  { position: "top-right-corner", field: "boxTopRightCorner", label: "Esquina superior derecha" },
  {
    position: "bottom-left-corner",
    field: "boxBottomLeftCorner",
    label: "Esquina inferior izquierda",
  },
  { position: "bottom-left", field: "boxBottomLeft", label: "Inferior izquierda" },
  { position: "bottom-center", field: "boxBottomCenter", label: "Inferior centro" },
  { position: "bottom-right", field: "boxBottomRight", label: "Inferior derecha" },
  {
    position: "bottom-right-corner",
    field: "boxBottomRightCorner",
    label: "Esquina inferior derecha",
  },
] as const;

const CAMPOS_MASTER = [
  { field: "pageWidthMm", label: "Ancho (mm)", positive: true },
  { field: "pageHeightMm", label: "Alto (mm)", positive: true },
  { field: "marginTopMm", label: "Margen superior", positive: false },
  { field: "marginBottomMm", label: "Margen inferior", positive: false },
  { field: "marginInnerMm", label: "Margen interior", positive: false },
  { field: "marginOuterMm", label: "Margen exterior", positive: false },
] as const;

type MasterField = (typeof CAMPOS_MASTER)[number]["field"];

type MasterRow = Record<MasterField, string> & { name: string };

const TIPOS_SECCION = [
  { type: "CHAPTER", label: "Capítulo" },
  { type: "PART", label: "Parte" },
  { type: "PROLOGUE", label: "Prólogo" },
  { type: "EPILOGUE", label: "Epílogo" },
  { type: "APPENDIX", label: "Apéndice" },
  { type: "GLOSSARY", label: "Glosario" },
  { type: "BIBLIOGRAPHY", label: "Bibliografía" },
  { type: "AUTHOR_NOTES", label: "Notas del autor" },
  { type: "ABOUT_AUTHOR", label: "Sobre el autor" },
  { type: "CUSTOM", label: "Personalizada" },
] as const;

function rowsFrom(decoration: EditionDecoration): MasterRow[] {
  return Object.entries(decoration.pageMasters ?? {}).map(([name, master]) => ({
    name,
    pageWidthMm: master.pageWidthMm?.toString() ?? "",
    pageHeightMm: master.pageHeightMm?.toString() ?? "",
    marginTopMm: master.marginTopMm?.toString() ?? "",
    marginBottomMm: master.marginBottomMm?.toString() ?? "",
    marginInnerMm: master.marginInnerMm?.toString() ?? "",
    marginOuterMm: master.marginOuterMm?.toString() ?? "",
  }));
}

function mastersPayload(rows: readonly MasterRow[]): Record<string, Record<string, number>> {
  const payload: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const name = row.name.trim();

    if (!name) {
      continue;
    }

    const master: Record<string, number> = {};

    for (const campo of CAMPOS_MASTER) {
      const raw = row[campo.field].trim();

      if (!raw) {
        continue;
      }

      const value = Number(raw);

      if (!Number.isFinite(value) || (campo.positive ? value <= 0 : value < 0)) {
        continue;
      }

      master[campo.field] = value;
    }

    payload[name] = master;
  }

  return payload;
}

/**
 * Decoración de página de la edición.
 *
 * Solo cambia folio, numeración, cajas base y páginas maestras; el resto se
 * hereda de la plantilla. Dejar un campo vacío mantiene el valor heredado.
 */
export function PageDecorationForm({ bookId, decoration }: PageDecorationFormProps) {
  const [state, formAction, pending] = useActionState(
    updateEditionDecorationAction,
    initialActionState,
  );
  const [masters, setMasters] = useState<MasterRow[]>(() => rowsFrom(decoration));
  const [sectionMasters, setSectionMasters] = useState<Record<string, string>>(() => ({
    ...(decoration.sectionMasters ?? {}),
  }));

  const masterNames = masters.map((master) => master.name.trim()).filter(Boolean);
  const cleanSectionMasters = Object.fromEntries(
    Object.entries(sectionMasters).filter(([, value]) => value.trim().length > 0),
  );

  const updateMaster = (index: number, field: keyof MasterRow, value: string): void => {
    setMasters((current) =>
      current.map((row, position) => (position === index ? { ...row, [field]: value } : row)),
    );
  };

  return (
    <section className="panel p-5" aria-labelledby="page-decoration-title">
      <h2 id="page-decoration-title" className="font-serif text-xl text-ink">
        Decoración de página
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Folio, numeración, cajas de margen y páginas maestras de esta edición. Lo que dejes vacío se
        hereda de la plantilla editorial.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="pageMasters" value={JSON.stringify(mastersPayload(masters))} />
        <input type="hidden" name="sectionMasters" value={JSON.stringify(cleanSectionMasters)} />

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

        <fieldset>
          <legend className="field-label">Páginas maestras</legend>
          <p className="field-hint">
            Una página maestra puede cambiar el tamaño o los márgenes de una sección. Solo se
            aplican los campos que rellenes.
          </p>

          <div className="mt-3 space-y-3">
            {masters.map((master, index) => (
              <div key={`master-${index}`} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1">
                    <label className="field-label" htmlFor={`master-name-${index}`}>
                      Nombre
                    </label>
                    <input
                      id={`master-name-${index}`}
                      className="field-input"
                      maxLength={40}
                      value={master.name}
                      onChange={(evento) => updateMaster(index, "name", evento.target.value)}
                      placeholder="apendice"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setMasters((current) => current.filter((_, position) => position !== index))
                    }
                  >
                    Quitar
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {CAMPOS_MASTER.map((campo) => (
                    <div key={campo.field}>
                      <label className="field-label" htmlFor={`${campo.field}-${index}`}>
                        {campo.label}
                      </label>
                      <input
                        id={`${campo.field}-${index}`}
                        className="field-input"
                        inputMode="decimal"
                        value={master[campo.field]}
                        onChange={(evento) => updateMaster(index, campo.field, evento.target.value)}
                        placeholder="Heredar"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setMasters((current) => [
                  ...current,
                  {
                    name: "",
                    pageWidthMm: "",
                    pageHeightMm: "",
                    marginTopMm: "",
                    marginBottomMm: "",
                    marginInnerMm: "",
                    marginOuterMm: "",
                  },
                ])
              }
            >
              Añadir página maestra
            </button>
          </div>

          {masterNames.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {TIPOS_SECCION.map((tipo) => (
                <div key={tipo.type}>
                  <label className="field-label" htmlFor={`section-master-${tipo.type}`}>
                    {tipo.label}
                  </label>
                  <select
                    id={`section-master-${tipo.type}`}
                    className="field-input"
                    value={sectionMasters[tipo.type] ?? ""}
                    onChange={(evento) =>
                      setSectionMasters((current) => ({
                        ...current,
                        [tipo.type]: evento.target.value,
                      }))
                    }
                  >
                    <option value="">Heredar de la plantilla</option>
                    {masterNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
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
