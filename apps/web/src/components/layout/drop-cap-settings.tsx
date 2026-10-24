"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { initialActionState } from "@/lib/action-state";
import { updateDropCapAction } from "@/lib/editorial/template-actions";
import type { DropCapSettings } from "@/lib/editorial/template-settings";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

type Override = { enabled: boolean; lines: 2 | 3 };

/**
 * Configuración única de la letra capital de la edición.
 *
 * La vista previa y la exportación leen este mismo ajuste: no hay dos
 * interruptores que puedan mostrar estados distintos. Las excepciones por
 * capítulo se guardan en el mismo objeto, de modo que la decisión general y
 * sus desvíos viajan juntos.
 */
export function DropCapSettingsForm({
  bookId,
  initial,
  chapters,
  canManage,
}: {
  bookId: string;
  initial: DropCapSettings;
  chapters: Array<{ id: string; title: string }>;
  canManage: boolean;
}) {
  const [state, action] = useActionState(updateDropCapAction, initialActionState);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [lines, setLines] = useState<DropCapSettings["lines"]>(initial.lines);
  const [overrides, setOverrides] = useState<Record<string, Override>>(initial.overrides ?? {});

  function modeOf(id: string): "inherit" | "on" | "off" {
    const value = overrides[id];
    return value ? (value.enabled ? "on" : "off") : "inherit";
  }

  function setMode(id: string, mode: "inherit" | "on" | "off") {
    setOverrides((current) => {
      const next = { ...current };

      if (mode === "inherit") {
        delete next[id];
      } else {
        next[id] = { enabled: mode === "on", lines: current[id]?.lines ?? lines };
      }

      return next;
    });
  }

  function setOverrideLines(id: string, value: 2 | 3) {
    setOverrides((current) => ({
      ...current,
      [id]: { enabled: current[id]?.enabled ?? true, lines: value },
    }));
  }

  function reset() {
    setEnabled(false);
    setLines(3);
    setOverrides({});
  }

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
        <input type="hidden" name="overrides" value={JSON.stringify(overrides)} />
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
          <details className="rounded-sm border border-ink/10 p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Excepciones por capítulo ({Object.keys(overrides).length})
            </summary>
            <p className="mt-2 text-xs text-ink-muted">
              Solo se guardan los capítulos que se apartan de la decisión general.
            </p>
            {chapters.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                Este libro todavía no tiene capítulos con título.
              </p>
            ) : (
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {chapters.map((chapter) => (
                  <li key={chapter.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm" title={chapter.title}>
                      {chapter.title}
                    </span>
                    <select
                      className="input w-auto"
                      aria-label={`Inicial de ${chapter.title}`}
                      value={modeOf(chapter.id)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMode(
                          chapter.id,
                          value === "on" ? "on" : value === "off" ? "off" : "inherit",
                        );
                      }}
                    >
                      <option value="inherit">Según la edición</option>
                      <option value="on">Con inicial</option>
                      <option value="off">Sin inicial</option>
                    </select>
                    {overrides[chapter.id] ? (
                      <select
                        className="input w-auto"
                        aria-label={`Líneas de la inicial de ${chapter.title}`}
                        value={overrides[chapter.id]?.lines ?? 3}
                        onChange={(event) =>
                          setOverrideLines(chapter.id, event.target.value === "2" ? 2 : 3)
                        }
                      >
                        <option value={2}>2 líneas</option>
                        <option value={3}>3 líneas</option>
                      </select>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </fieldset>
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton
            label="Guardar letra capital"
            pendingLabel="Guardando…"
            disabled={!canManage}
          />
          <button type="button" className="btn btn-secondary" onClick={reset} disabled={!canManage}>
            Restaurar valores del preset
          </button>
          <Link className="text-sm underline" href={`/books/${bookId}/preview`}>
            Ver en la vista previa
          </Link>
        </div>
      </form>
    </section>
  );
}
