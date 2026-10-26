"use client";

import { useCallback, useState } from "react";
import { getBookWorldCoverage } from "@/lib/story/world-coverage-actions";

type Data = Extract<Awaited<ReturnType<typeof getBookWorldCoverage>>, { ok: true }>;

/**
 * Cobertura del mundo en el manuscrito.
 *
 * Se carga al desplegar el bloque para no recorrer el libro en cada visita. Los
 * huecos se muestran como avisos informativos: una ausencia puede ser
 * deliberada, así que nunca se afirma que haya un error.
 */
export function WorldCoveragePanel({ bookId }: { bookId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (data || loading) return;
    setLoading(true);
    try {
      const result = await getBookWorldCoverage(bookId);
      if (!result.ok) setError(result.error);
      else setData(result);
    } catch {
      setError("No se pudo revisar el manuscrito.");
    } finally {
      setLoading(false);
    }
  }, [bookId, data, loading]);

  return (
    <details
      className="panel p-5"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary className="cursor-pointer font-serif text-xl text-ink">
        Cobertura del mundo · apariciones y ausencias
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Qué lugares, objetos y reglas entran en el texto y en qué tramos dejan de aparecer. Los
        huecos de tres secciones o más se señalan como aviso, nunca como error.
      </p>

      {loading ? <p className="mt-3 text-sm text-ink-muted">Revisando el manuscrito…</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {data ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-ink-muted">
            {data.covered.length + data.missing.length} fichas y {data.sections} secciones con texto
            revisadas.
          </p>

          {data.covered.length ? (
            <ul className="space-y-2">
              {data.covered.map((world) => (
                <li key={world.worldId} className="rounded-lg bg-surface-subtle p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-sm text-ink">{world.name}</strong>
                    <span className="text-xs text-ink-muted">
                      {world.total} menciones en {world.sections.length} secciones ·{" "}
                      {Math.round(world.timeline.coverage * 100)}% del libro
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {world.sections
                      .map((section) => `${section.sectionTitle} (${section.count})`)
                      .join(" · ")}
                  </p>
                  {world.alerts.length ? (
                    <ul className="mt-2 space-y-1">
                      {world.alerts.map((alert) => (
                        <li
                          key={`${alert.kind}-${alert.section}`}
                          className="text-xs text-ink-soft"
                        >
                          <span className="meta-label">Aviso</span> {alert.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              Ningún lugar del libro aparece todavía en el manuscrito.
            </p>
          )}

          {data.missing.length ? (
            <div className="rounded-lg border border-line p-3">
              <h4 className="text-sm font-semibold text-ink">Mundos sin menciones</h4>
              <p className="mt-1 text-xs text-ink-muted">
                Puede que aún no hayan entrado en el texto o que se nombren con una variante que no
                está en la ficha.
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                {data.missing.map((world) => world.name).join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
