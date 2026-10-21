"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { requestExportAction, type ExportActionState } from "@/lib/export/actions";
import { initialActionState } from "@/lib/action-state";
import type { ExportFormat } from "@escribiendo/database";

interface ExportPanelProps {
  bookId: string;
  /** Si el libro tiene maquetación, el PDF se puede componer. */
  hasLayout: boolean;
}

const FORMATOS: Array<{ id: ExportFormat; label: string; description: string }> = [
  {
    id: "PDF_DIGITAL",
    label: "PDF digital",
    description: "Para leer y distribuir. Sin marcas de corte.",
  },
  {
    id: "PDF_PRINT",
    label: "PDF de imprenta",
    description: "Con sangrado y marcas de corte.",
  },
  {
    id: "EPUB3",
    label: "EPUB 3",
    description: "Para lectores y tiendas. Texto adaptable.",
  },
  {
    id: "DOCX",
    label: "DOCX",
    description: "Para revisión y maquetación en Word.",
  },
];

/**
 * Panel de exportación.
 *
 * Cada formato genera su archivo en el momento. La descarga va firmada y
 * caduca a los pocos minutos: si caduca, se vuelve a pedir.
 */
export function ExportPanel({ bookId, hasLayout }: ExportPanelProps) {
  const [state, formAction] = useActionState<ExportActionState, FormData>(
    requestExportAction,
    initialActionState,
  );

  return (
    <div className="space-y-6">
      <FormMessage state={state} />

      <ul className="space-y-3">
        {FORMATOS.map((formato) => {
          const sinMaqueta = formato.id.startsWith("PDF") && !hasLayout;

          return (
            <li key={formato.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif text-lg text-ink">{formato.label}</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    {sinMaqueta
                      ? "El libro necesita una plantilla de maquetación para componer el PDF. Elígela en Maquetación."
                      : formato.description}
                  </p>
                </div>

                <form action={formAction}>
                  <input type="hidden" name="bookId" value={bookId} />
                  <input type="hidden" name="format" value={formato.id} />
                  <button type="submit" className="btn btn-secondary" disabled={sinMaqueta}>
                    Generar
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      {state.status === "success" && state.downloadUrl ? (
        <section className="panel p-5" aria-label="descarga">
          <h3 className="font-serif text-lg text-ink">Archivo listo</h3>

          {state.metadata ? (
            <dl className="mt-3 grid gap-1 text-sm text-ink-soft sm:grid-cols-2">
              {state.metadata.fileName ? (
                <div className="flex gap-2">
                  <dt className="text-ink-muted">Archivo:</dt>
                  <dd className="truncate">{state.metadata.fileName}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="text-ink-muted">Tamaño:</dt>
                <dd>{formatBytes(state.metadata.bytes)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink-muted">Palabras:</dt>
                <dd>{new Intl.NumberFormat("es-ES").format(state.metadata.wordCount)}</dd>
              </div>
              {state.metadata.pageCount !== null && state.metadata.pageCount !== undefined ? (
                <div className="flex gap-2">
                  <dt className="text-ink-muted">Páginas:</dt>
                  <dd>{state.metadata.pageCount}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="text-ink-muted">Huella:</dt>
                <dd className="truncate font-mono text-xs">
                  {state.metadata.sha256.slice(0, 16)}…
                </dd>
              </div>
            </dl>
          ) : null}

          <div className="mt-4">
            <a className="btn btn-primary" href={state.downloadUrl} download>
              Descargar
            </a>
          </div>

          {state.metadata && state.metadata.caracteresPerdidos.length > 0 ? (
            <p className="alert alert-error mt-4" role="alert">
              El archivo no ha podido representar{" "}
              {state.metadata.caracteresPerdidos.length === 1
                ? "un carácter"
                : "algunos caracteres"}{" "}
              ({state.metadata.caracteresPerdidos.join(" ")}). En el PDF aparecen como un signo
              vacío, porque la fuente estándar no los incluye; en el EPUB y el DOCX se conservan sin
              cambio.
            </p>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            La dirección caduca en unos minutos. Si deja de funcionar, vuelve a generar el archivo.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
