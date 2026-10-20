"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { createLayoutProfileAction, updateLayoutProfileAction } from "@/lib/layout/actions";
import { initialActionState } from "@/lib/action-state";
import { PAGE_FORMAT_PRESETS, type PageFormatId } from "@escribiendo/editorial-engine";
import type { LayoutProfileSummary } from "@/lib/layout/profiles";

interface LayoutProfileFormProps {
  mode: "create" | "edit";
  profile?: LayoutProfileSummary;
  /** Libro desde el que se ha abierto el formulario. */
  bookId: string;
}

const FORMATOS = Object.values(PAGE_FORMAT_PRESETS);

const CAMPOS_GEOMETRIA = [
  { name: "marginTopMm", label: "Margen superior" },
  { name: "marginBottomMm", label: "Margen inferior" },
  { name: "marginInnerMm", label: "Margen interior" },
  { name: "marginOuterMm", label: "Margen exterior" },
  { name: "gutterMm", label: "Medianil" },
  { name: "bleedMm", label: "Sangrado" },
  { name: "headerDistanceMm", label: "Distancia del encabezado" },
  { name: "footerDistanceMm", label: "Distancia del pie" },
] as const;

/**
 * Formulario de un perfil de página.
 *
 * Al elegir un formato conocido se rellenan las medidas de referencia. La
 * geometría la valida el servidor contra el motor de maquetación: un perfil
 * con márgenes que no dejan área de texto no llega a guardarse.
 */
export function LayoutProfileForm({ mode, profile, bookId }: LayoutProfileFormProps) {
  const action = mode === "create" ? createLayoutProfileAction : updateLayoutProfileAction;
  const [state, formAction] = useActionState(action, initialActionState);
  const [format, setFormat] = useState<string>(profile?.format ?? "A5");
  const [width, setWidth] = useState<string>(String(profile?.pageWidthMm ?? 148));
  const [height, setHeight] = useState<string>(String(profile?.pageHeightMm ?? 210));

  const applyPreset = (next: string): void => {
    setFormat(next);

    const preset = PAGE_FORMAT_PRESETS[next as Exclude<PageFormatId, "CUSTOM">];

    if (!preset) {
      return;
    }

    setWidth(String(preset.widthMm));
    setHeight(String(preset.heightMm));
  };

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />

      {profile ? <input type="hidden" name="profileId" value={profile.id} /> : null}
      <input type="hidden" name="bookId" value={bookId} />

      <TextField
        name="name"
        label="Nombre del perfil"
        placeholder="A5 de la primera edición"
        defaultValue={profile?.name ?? ""}
        error={state.fieldErrors?.name}
      />

      <div>
        <label className="field-label" htmlFor="profile-format">
          Formato
        </label>
        <select
          id="profile-format"
          name="format"
          className="field-input"
          value={format}
          onChange={(event) => applyPreset(event.target.value)}
        >
          {FORMATOS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value="CUSTOM">A medida</option>
        </select>
        <p className="field-hint">
          Al elegir un formato se rellenan el ancho y el alto de referencia. Las medidas siempre se
          pueden ajustar a mano.
        </p>
      </div>

      <fieldset className="space-y-5">
        <legend className="font-serif text-lg text-ink">Geometría</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <MedidaField
            name="pageWidthMm"
            label="Ancho de página"
            value={width}
            onChange={setWidth}
            error={state.fieldErrors?.pageWidthMm}
          />
          <MedidaField
            name="pageHeightMm"
            label="Alto de página"
            value={height}
            onChange={setHeight}
            error={state.fieldErrors?.pageHeightMm}
          />

          {CAMPOS_GEOMETRIA.map((campo) => (
            <MedidaField
              key={campo.name}
              name={campo.name}
              label={campo.label}
              defaultValue={String(profile?.[campo.name] ?? "")}
              error={state.fieldErrors?.[campo.name]}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-serif text-lg text-ink">Opciones de composición</legend>

        <label className="flex items-center gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="mirrorMargins"
            defaultChecked={profile?.mirrorMargins ?? true}
            className="size-4"
          />
          Reflejar los márgenes: el interior y el exterior se alternan
        </label>

        <label className="flex items-center gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="showPageNumbers"
            defaultChecked={profile?.showPageNumbers ?? true}
            className="size-4"
          />
          Imprimir los folios
        </label>

        <label className="flex items-center gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="chapterStartsRecto"
            defaultChecked={profile?.chapterStartsRecto ?? true}
            className="size-4"
          />
          Los capítulos empiezan en página par (la derecha)
        </label>
      </fieldset>

      <SubmitButton
        label={mode === "create" ? "Crear perfil" : "Guardar cambios"}
        pendingLabel={mode === "create" ? "Creando…" : "Guardando…"}
      />
    </form>
  );
}

interface MedidaFieldProps {
  name: string;
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string;
}

/** Campo de medida en milímetros. */
function MedidaField({ name, label, value, defaultValue, onChange, error }: MedidaFieldProps) {
  const inputId = `field-${name}`;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label className="field-label" htmlFor={inputId}>
        {label} <span className="text-ink-muted">(mm)</span>
      </label>
      <input
        id={inputId}
        name={name}
        type="number"
        step="0.5"
        min="0"
        className="field-input"
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
