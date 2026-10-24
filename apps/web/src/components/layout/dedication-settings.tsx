"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  DEDICATION_MAX_CHARS,
  DEDICATION_RECOMMENDED_CHARS,
  buildDedicationPage,
  type DedicationTemplate,
  type MatterBlock,
} from "@escribiendo/templates";
import { initialActionState } from "@/lib/action-state";
import { updateDedicationAction } from "@/lib/editorial/template-actions";
import {
  DEFAULT_DEDICATION_SETTINGS,
  type DedicationSettings,
} from "@/lib/editorial/template-settings";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

const TEMPLATE_LABELS: Record<DedicationTemplate, string> = {
  classic: "Clásica · filetes sobre y bajo el texto",
  minimal: "Esencial · solo texto y firma",
  literary: "Literaria · cursiva",
};

function alignmentClass(block: MatterBlock): string {
  const alignment =
    block.alignment ??
    (block.role === "right" ? "right" : block.role === "center" ? "center" : "left");

  return alignment === "right"
    ? "text-right"
    : alignment === "center"
      ? "text-center"
      : "text-left";
}

export function DedicationSettings({
  bookId,
  initial,
  text,
  sectionId,
  canManage,
}: {
  bookId: string;
  initial: DedicationSettings;
  /** Texto actual de la sección `DEDICATION`, sin formato. */
  text: string;
  sectionId: string | null;
  canManage: boolean;
}) {
  const [state, action] = useActionState(updateDedicationAction, initialActionState);
  const [template, setTemplate] = useState<DedicationSettings["template"]>(initial.template);
  const [alignment, setAlignment] = useState<DedicationSettings["alignment"]>(initial.alignment);
  const [verticalPosition, setVerticalPosition] = useState<DedicationSettings["verticalPosition"]>(
    initial.verticalPosition,
  );
  const [signature, setSignature] = useState(initial.signature);

  const page = buildDedicationPage({
    text,
    template,
    alignment,
    verticalPosition,
    signature,
  });
  const top = page.blocks.find((block) => block.role === "spacer")?.spaceFraction ?? 0;
  const visible = page.blocks.filter((block) => block.role !== "spacer");
  const overRecommended = page.characters > DEDICATION_RECOMMENDED_CHARS;
  const overMaximum = page.characters > DEDICATION_MAX_CHARS;

  function reset() {
    setTemplate(DEFAULT_DEDICATION_SETTINGS.template);
    setAlignment(DEFAULT_DEDICATION_SETTINGS.alignment);
    setVerticalPosition(DEFAULT_DEDICATION_SETTINGS.verticalPosition);
    setSignature(DEFAULT_DEDICATION_SETTINGS.signature);
  }

  return (
    <section className="space-y-5" aria-labelledby="dedication-title">
      <h2 id="dedication-title" className="scroll-mt-28 font-serif text-2xl">
        Dedicatoria
      </h2>
      <p className="text-sm text-ink-soft">
        El texto se edita en la sección «Dedicatoria» del manuscrito. Aquí eliges cómo se compone:
        la misma plantilla, alineación, posición y firma se aplican en la vista previa y en el PDF.
      </p>
      {!sectionId ? (
        <p className="alert" role="note">
          Este libro todavía no tiene una sección «Dedicatoria». Añádela al manuscrito para poder
          componerla.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <form action={action} className="space-y-4">
          <input type="hidden" name="bookId" value={bookId} />
          <fieldset className="space-y-4" disabled={!canManage}>
            <legend className="sr-only">Composición de la dedicatoria</legend>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Plantilla</span>
              <select
                name="template"
                className="input"
                value={template}
                onChange={(event) => setTemplate(event.target.value as DedicationTemplate)}
              >
                {Object.entries(TEMPLATE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Alineación</span>
                <select
                  name="alignment"
                  className="input"
                  value={alignment}
                  onChange={(event) =>
                    setAlignment(event.target.value as DedicationSettings["alignment"])
                  }
                >
                  <option value="right">Derecha</option>
                  <option value="center">Centrada</option>
                  <option value="left">Izquierda</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Posición vertical</span>
                <select
                  name="verticalPosition"
                  className="input"
                  value={verticalPosition}
                  onChange={(event) =>
                    setVerticalPosition(
                      event.target.value as DedicationSettings["verticalPosition"],
                    )
                  }
                >
                  <option value="upper">Zona superior</option>
                  <option value="center">Centro de la página</option>
                  <option value="lower">Zona inferior</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Firma (opcional)</span>
              <input
                name="signature"
                className="input"
                maxLength={DEDICATION_MAX_CHARS}
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="El autor"
              />
            </label>
            <p className="text-xs text-ink-soft">
              {page.characters} caracteres.
              {overRecommended
                ? overMaximum
                  ? ` Supera el máximo editorial de ${DEDICATION_MAX_CHARS}; se compone sin recortar y puede desbordar.`
                  : ` Se recomienda no pasar de ${DEDICATION_RECOMMENDED_CHARS}.`
                : ""}
            </p>
          </fieldset>
          <FormMessage state={state} />
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton
              label="Guardar dedicatoria"
              pendingLabel="Guardando…"
              disabled={!canManage}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={reset}
              disabled={!canManage}
            >
              Restaurar valores del preset
            </button>
          </div>
        </form>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Vista de posición</p>
          <div className="relative mx-auto aspect-[152/229] w-full max-w-[220px] overflow-hidden rounded-sm border border-ink/15 bg-white">
            <div className="absolute inset-x-[10%] bottom-[8%] top-[8%]">
              <div className="absolute inset-x-0" style={{ top: `${Math.round(top * 100)}%` }}>
                {visible.length === 0 ? (
                  <p className="text-[9px] text-ink-soft">Sin texto que componer.</p>
                ) : (
                  visible.map((block, index) =>
                    block.role === "rule" ? (
                      <hr key={index} className="my-1 border-ink/40" />
                    ) : (
                      <p
                        key={index}
                        className={`text-[9px] leading-snug ${alignmentClass(block)} ${
                          block.role === "italic" ? "italic" : ""
                        }`}
                      >
                        {block.text}
                      </p>
                    ),
                  )
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-ink-soft">
            La posición se mide sobre el área de texto, no sobre el papel.
          </p>
          {sectionId ? (
            <Link className="text-sm underline" href={`/books/${bookId}/sections/${sectionId}`}>
              Editar el texto de la dedicatoria
            </Link>
          ) : null}
        </div>
      </div>
      {page.warnings.length > 0 ? (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {page.warnings.map((warning) => (
            <li
              key={warning.code}
              className={warning.severity === "error" ? "text-danger" : "text-ink-soft"}
            >
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
