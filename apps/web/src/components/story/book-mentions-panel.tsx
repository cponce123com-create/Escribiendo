"use client";

import { useCallback, useState } from "react";
import { getBookEntityMentions } from "@/lib/story/entity-mentions-actions";

type Data = Awaited<ReturnType<typeof getBookEntityMentions>>;

const KIND_LABELS: Record<string, string> = {
  CHARACTER: "Personaje",
  WORLD: "Mundo",
};

/**
 * Mapa de menciones del libro.
 *
 * Se carga al desplegar el bloque para no consultar el manuscrito en cada
 * visita al directorio. Es una lectura de apoyo: no vincula ni crea nada.
 */
export function BookMentionsPanel({ bookId }: { bookId: string }) {
  const [data, setData] = useState<Exclude<Data, { ok: false }> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (data || loading) return;
    setLoading(true);
    try {
      const result = await getBookEntityMentions(bookId);
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
        Mapa de menciones · personajes y mundos en el manuscrito
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Comprueba qué fichas aparecen en el texto y cuáles todavía no se mencionan. Las
        coincidencias son exactas por nombre, sin distinguir mayúsculas ni tildes.
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
            {data.entities} fichas y {data.sections} secciones revisadas. {data.notice}
          </p>

          {data.mentions.length ? (
            <ul className="space-y-2">
              {data.mentions.map((mention) => (
                <li key={mention.entityId} className="rounded-lg bg-surface-subtle p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-sm text-ink">{mention.entityName}</strong>
                    <span className="text-xs text-ink-muted">
                      {KIND_LABELS[mention.kind] ?? mention.kind} · {mention.total} menciones en{" "}
                      {mention.sectionCount} secciones
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {mention.sections
                      .map((section) => `${section.sectionTitle} (${section.count})`)
                      .join(" · ")}
                    {mention.sectionCount > mention.sections.length
                      ? ` · +${mention.sectionCount - mention.sections.length} secciones`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              Ninguna ficha coincide con el texto del manuscrito.
            </p>
          )}

          {data.missing.length ? (
            <div className="rounded-lg border border-line p-3">
              <h4 className="text-sm font-semibold text-ink">Fichas sin menciones</h4>
              <p className="mt-1 text-xs text-ink-muted">
                Puede que aún no hayan entrado en el texto o que se nombren de otra forma.
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                {data.missing
                  .map((entity) => `${entity.name} (${KIND_LABELS[entity.kind] ?? entity.kind})`)
                  .join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
