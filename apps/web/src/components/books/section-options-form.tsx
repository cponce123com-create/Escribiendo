"use client";
import { useActionState } from "react";
import { updateSectionOptionsAction } from "@/lib/books/actions";
import { initialActionState } from "@/lib/action-state";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

export interface SectionOptions {
  includeInExport: boolean;
  showInToc: boolean;
  pageBreakBefore: boolean;
  startOnOddPage: boolean;
}
export function SectionOptionsForm({
  sectionId,
  options,
  canEdit,
}: {
  sectionId: string;
  options: SectionOptions;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateSectionOptionsAction, initialActionState);
  const labels = {
    includeInExport: "Incluir en la exportación",
    showInToc: "Mostrar en el índice",
    pageBreakBefore: "Salto de página antes",
    startOnOddPage: "Comenzar en página impar",
  };
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <FormMessage state={state} />
      <fieldset disabled={!canEdit} className="space-y-3">
        <legend className="field-label">Opciones de composición</legend>
        {(Object.keys(labels) as Array<keyof SectionOptions>).map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" role="switch" name={name} defaultChecked={options[name]} />
            {labels[name]}
          </label>
        ))}
        {canEdit ? <SubmitButton label="Guardar opciones" pendingLabel="Guardando…" /> : null}
      </fieldset>
    </form>
  );
}
