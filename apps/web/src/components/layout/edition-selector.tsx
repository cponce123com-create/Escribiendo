"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { updateEditionAction } from "@/lib/layout/actions";
import { initialActionState } from "@/lib/action-state";
import type { TemplateSummary } from "@/lib/layout/profiles";

interface EditionSelectorProps {
  bookId: string;
  templates: TemplateSummary[];
  selectedTemplateId: string | null;
}

/**
 * Elección de la plantilla del libro.
 *
 * La plantilla es la única decisión: lleva la geometría de la página, los
 * márgenes y la tipografía. La aplicación crea o reutiliza el perfil de
 * página a partir de esos valores, sin pedir medidas en este paso.
 */
export function EditionSelector({ bookId, templates, selectedTemplateId }: EditionSelectorProps) {
  const [state, formAction] = useActionState(updateEditionAction, initialActionState);

  if (templates.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        No hay plantillas disponibles. Vuelve a abrir la maquetación para instalar el catálogo del
        sistema.
      </p>
    );
  }

  const selectedExists = templates.some((template) => template.id === selectedTemplateId);
  const checkedTemplateId = selectedExists ? selectedTemplateId : (templates[0]?.id ?? null);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <input type="hidden" name="bookId" value={bookId} />

      <fieldset className="space-y-3">
        <legend className="field-label">Plantilla editorial</legend>
        <p className="field-hint">
          La página, los márgenes y la tipografía vienen definidos por la plantilla. No hay nada más
          que configurar.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => {
            const isCurrent = template.id === selectedTemplateId;

            return (
              <label
                key={template.id}
                className={`panel block cursor-pointer p-5 transition ${
                  isCurrent ? "border-accent/60" : ""
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="templateId"
                    value={template.id}
                    defaultChecked={template.id === checkedTemplateId}
                    className="mt-1 size-4 shrink-0"
                  />

                  <span className="min-w-0 space-y-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-lg text-ink">{template.name}</span>
                      {template.isSystem ? (
                        <span className="text-[0.62rem] uppercase tracking-wider text-ink-muted">
                          del sistema
                        </span>
                      ) : null}
                      {isCurrent ? (
                        <span className="text-[0.62rem] uppercase tracking-wider text-success">
                          en uso
                        </span>
                      ) : null}
                    </span>

                    {template.description ? (
                      <span className="block text-sm leading-relaxed text-ink-muted">
                        {template.description}
                      </span>
                    ) : null}

                    <span className="grid gap-1 text-xs text-ink-muted">
                      <span>
                        Página: {template.page.pageWidthMm} × {template.page.pageHeightMm} mm
                      </span>
                      <span>
                        Márgenes (sup./inf./int./ext.): {template.page.marginTopMm}/
                        {template.page.marginBottomMm}/{template.page.marginInnerMm}/
                        {template.page.marginOuterMm} mm
                      </span>
                      <span>
                        Cuerpo: {template.config.typography.body.fontSizePt} pt · interlineado{" "}
                        {template.config.typography.body.lineHeight}
                      </span>
                      <span>
                        {template.page.chapterStartsRecto
                          ? "Capítulos en página par"
                          : "Capítulos en cualquier página"}
                      </span>
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <SubmitButton label="Aplicar plantilla" pendingLabel="Aplicando…" />
    </form>
  );
}
