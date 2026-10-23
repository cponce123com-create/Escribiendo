"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TOC_TEMPLATE_CATALOG, type TocParameters } from "@escribiendo/templates";
import type { PreviewResult } from "@/lib/layout/preview";
import { tocGalleryPreview } from "@/lib/editorial/gallery-preview";
import { updateTocTemplateAction } from "@/lib/editorial/template-actions";
import { initialActionState } from "@/lib/action-state";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { MatterSheet } from "./matter-sheet";
export function TocTemplateGallery({
  bookId,
  cards,
  initial,
  canManage,
  warning,
  manual,
}: {
  bookId: string;
  cards: Array<{ slug: string; preview: PreviewResult | null }>;
  initial: TocParameters;
  canManage: boolean;
  warning: string | null;
  manual: boolean;
}) {
  const router = useRouter();
  const [parameters, setParameters] = useState(initial);
  const [preview, setPreview] = useState(
    cards.find((card) => card.slug === initial.tocTemplate)?.preview ?? null,
  );
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [state, action] = useActionState(updateTocTemplateAction, initialActionState);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        startTransition(async () => {
          try {
            const result = await tocGalleryPreview(bookId, parameters);
            if (active) {
              setPreview(result);
              setError("");
            }
          } catch {
            if (active) setError("No se pudo actualizar el índice. Vuelve a intentarlo.");
          }
        }),
      350,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [bookId, parameters]);
  function update<K extends keyof TocParameters>(key: K, value: TocParameters[K]) {
    setParameters((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <section className="space-y-5" aria-labelledby="toc-title">
      <h2 id="toc-title" className="font-serif text-2xl">
        Índice automático
      </h2>
      <p className="text-sm text-ink-soft">
        Los títulos y folios se calculan a partir del manuscrito. El diseño no cambia el texto del
        libro.
      </p>
      {warning ? (
        <p className="alert alert-error" role="status">
          {warning}
        </p>
      ) : null}
      {manual ? (
        <p className="alert" role="status">
          Este libro conserva un índice manual antiguo. Al usar una plantilla se activa el
          automático; su texto seguirá disponible en el manuscrito.
        </p>
      ) : null}
      <form action={action} className="space-y-5">
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="parameters" value={JSON.stringify(parameters)} />
        <fieldset disabled={!canManage}>
          <legend className="sr-only">Diseño de índice</legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOC_TEMPLATE_CATALOG.map((item) => (
              <label
                key={item.slug}
                className="panel cursor-pointer space-y-3 p-4 focus-within:ring-2 focus-within:ring-brand"
              >
                <span className="flex gap-2">
                  <input
                    type="radio"
                    name="toc-gallery"
                    checked={parameters.tocTemplate === item.slug}
                    value={item.slug}
                    onChange={() => setParameters(item.parameters)}
                  />
                  <strong>{item.name}</strong>
                </span>
                <MatterSheet
                  mini
                  preview={cards.find((card) => card.slug === item.slug)?.preview ?? null}
                />
                <p className="text-sm text-ink-soft">{item.description}</p>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <fieldset disabled={!canManage} className="panel space-y-4 p-5">
            <legend className="font-semibold">Ajustes del índice</legend>
            <label className="block text-sm">
              Título
              <select
                className="field-input"
                value={parameters.tocTitle}
                onChange={(event) =>
                  update("tocTitle", event.target.value as TocParameters["tocTitle"])
                }
              >
                {["Índice", "Contenido", "Tabla de contenidos"].map((title) => (
                  <option key={title}>{title}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Alineación
              <select
                className="field-input"
                value={parameters.tocAlignment}
                onChange={(event) =>
                  update("tocAlignment", event.target.value as TocParameters["tocAlignment"])
                }
              >
                <option value="left">Izquierda</option>
                <option value="center">Centrada</option>
                <option value="right">Derecha</option>
              </select>
            </label>
            <label className="block text-sm">
              Profundidad
              <select
                className="field-input"
                value={parameters.tocDepth}
                onChange={(event) =>
                  update("tocDepth", event.target.value as TocParameters["tocDepth"])
                }
              >
                <option value="parts-chapters">Partes y capítulos</option>
                <option value="chapters-h1">Capítulos y encabezados de nivel 1</option>
                <option value="chapters-h1-h2">Hasta encabezados de nivel 2</option>
                <option value="chapters-h1-h2-h3">Hasta encabezados de nivel 3</option>
              </select>
            </label>
            {(
              [
                ["tocPageNumbers", "Mostrar números de página"],
                ["tocLeaders", "Puntos guía"],
                ["tocIncludeFrontMatter", "Incluir preliminares"],
                ["tocIncludeBackMatter", "Incluir páginas finales"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={parameters[key]}
                  onChange={(event) => update(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
            <p className="text-xs text-ink-muted">
              EPUB usa navegación semántica sin folios. El diseño compacto reduce el cuerpo; un
              índice extenso continúa en otra página para no perder entradas.
            </p>
            <FormMessage state={state} />
            <SubmitButton label="Usar esta plantilla" pendingLabel="Guardando…" disabled={busy} />
          </fieldset>
          <div className="space-y-3">
            {busy ? <p role="status">Recalculando páginas…</p> : null}
            {error ? (
              <p className="alert alert-error" role="status">
                {error}
              </p>
            ) : null}
            <MatterSheet preview={preview} />
          </div>
        </div>
      </form>
    </section>
  );
}
