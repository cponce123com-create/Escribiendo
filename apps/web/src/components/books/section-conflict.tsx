"use client";

import { useMemo } from "react";
import { diffWords, extractPlainText, parseTiptapDocument } from "@escribiendo/book-schema";
import type { TiptapDocument } from "@escribiendo/book-schema";
import type { SectionConflict } from "@/lib/editor/sync";

interface SectionConflictPanelProps {
  conflict: SectionConflict;
  /** Contenido que hay ahora mismo en el editor. */
  localContent: TiptapDocument | null;
  onKeepLocal: () => void;
  onTakeServer: () => void;
}

/**
 * Elección de versión cuando el servidor tiene un texto más reciente.
 *
 * No se descarta ninguna de las dos versiones: se muestran comparadas y es
 * quien escribe quien decide. Conservar la versión local pide al servidor que
 * la acepte aunque su número de versión sea anterior.
 */
export function SectionConflictPanel({
  conflict,
  localContent,
  onKeepLocal,
  onTakeServer,
}: SectionConflictPanelProps) {
  const comparacion = useMemo(() => {
    if (!localContent) {
      return null;
    }

    const local = extractPlainText(localContent);
    const servidor = extractPlainText(parseTiptapDocument(JSON.parse(conflict.serverContent)));

    return {
      segmentos: diffWords(servidor, local),
      palabrasLocales: local.split(/\s+/u).filter(Boolean).length,
      palabrasServidor: servidor.split(/\s+/u).filter(Boolean).length,
    };
  }, [conflict.serverContent, localContent]);

  return (
    <section className="panel p-5" aria-label="conflicto de versiones">
      <p className="meta-label">Conflicto</p>
      <h3 className="mt-1.5 font-serif text-xl text-ink">
        Hay dos versiones distintas de esta sección
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        El servidor tiene la versión {conflict.serverVersion}
        {conflict.serverAuthor ? ` , guardada por ${conflict.serverAuthor}` : ""} y el equipo tiene
        otra más reciente sin confirmar. No se ha perdido ninguna de las dos: elige cuál conservar.
      </p>

      {comparacion ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-ink-muted">
            {comparacion.palabrasServidor} palabras en el servidor · {comparacion.palabrasLocales}{" "}
            en el equipo
          </p>

          <div
            className="max-h-64 overflow-y-auto rounded-sm border border-line bg-ink/[0.02] p-3 text-sm leading-relaxed"
            aria-label="comparación de las dos versiones"
          >
            {comparacion.segmentos.map((segmento, index) => (
              <span
                key={`${segmento.type}-${index}`}
                className={
                  segmento.type === "insert"
                    ? "rounded-sm bg-success/15 text-ink"
                    : segmento.type === "delete"
                      ? "rounded-sm bg-danger/15 text-ink line-through"
                      : "text-ink-soft"
                }
              >
                {segmento.text}
              </span>
            ))}
          </div>

          <p className="text-xs text-ink-muted">
            Lo tachado está en el servidor; lo resaltado, solo en el equipo.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onKeepLocal}>
          Conservar mi versión
        </button>
        <button type="button" className="btn btn-secondary" onClick={onTakeServer}>
          Usar la del servidor
        </button>
      </div>
    </section>
  );
}
