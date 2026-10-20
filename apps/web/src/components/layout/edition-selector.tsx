"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { updateEditionAction } from "@/lib/layout/actions";
import { initialActionState } from "@/lib/action-state";
import type { LayoutProfileSummary, TemplateSummary } from "@/lib/layout/profiles";

interface EditionSelectorProps {
  bookId: string;
  profiles: LayoutProfileSummary[];
  templates: TemplateSummary[];
  selectedProfileId: string | null;
  selectedTemplateId: string | null;
}

/**
 * Elección de la maqueta del libro: un perfil de página y una plantilla
 * editorial.
 *
 * La plantilla fija el estilo (cuerpo, títulos, viudas y huérfanas) y el
 * perfil la geometría (tamaño, márgenes, sangrado).
 */
export function EditionSelector({
  bookId,
  profiles,
  templates,
  selectedProfileId,
  selectedTemplateId,
}: EditionSelectorProps) {
  const [state, formAction] = useActionState(updateEditionAction, initialActionState);

  if (profiles.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Crea antes un perfil de página: sin geometría no hay maqueta que aplicar.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <input type="hidden" name="bookId" value={bookId} />

      <div>
        <label className="field-label" htmlFor="edition-profile">
          Perfil de página
        </label>
        <select
          id="edition-profile"
          name="profileId"
          className="field-input"
          defaultValue={selectedProfileId ?? profiles[0]?.id ?? ""}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name} ({profile.pageWidthMm} × {profile.pageHeightMm} mm)
            </option>
          ))}
        </select>
        <p className="field-hint">Define el tamaño de la página, los márgenes y el sangrado.</p>
      </div>

      <div>
        <label className="field-label" htmlFor="edition-template">
          Plantilla editorial
        </label>
        <select
          id="edition-template"
          name="templateId"
          className="field-input"
          defaultValue={selectedTemplateId ?? templates[0]?.id ?? ""}
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
              {template.isSystem ? " (del sistema)" : ""}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Define el cuerpo, los títulos y el control de viudas y huérfanas.
        </p>
      </div>

      <SubmitButton label="Aplicar maqueta" pendingLabel="Aplicando…" />
    </form>
  );
}
