"use client";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  getCharacterSuggestions,
  queueBookCharacterAnalysis,
  reviewCharacterSuggestion,
} from "@/lib/story/character-intelligence-actions";
import { initialActionState } from "@/lib/action-state";
import type { CharacterView } from "@/lib/story/queries";
type Snapshot = Extract<Awaited<ReturnType<typeof getCharacterSuggestions>>, { ok: true }>;
type Suggestion = Snapshot["suggestions"][number];
function SuggestionCard({
  item,
  bookId,
  characters,
}: {
  item: Suggestion;
  bookId: string;
  characters: CharacterView[];
}) {
  const [state, action, pending] = useActionState(reviewCharacterSuggestion, initialActionState);
  useEffect(() => {
    if (state.status === "success") window.dispatchEvent(new Event("story-suggestions-refresh"));
  }, [state]);
  return (
    <article className="rounded-xl border border-line bg-white/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="meta-label">
            {item.mentions} menciones · confianza orientativa {Math.round(item.confidence * 100)}% ·{" "}
            {item.section.title}
          </p>
          <h3 className="mt-1 font-serif text-lg text-ink">{item.suggestedName}</h3>
        </div>
        {item.stale ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900">
            Texto reescrito; revisa la evidencia
          </span>
        ) : null}
      </div>
      <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-sm text-ink-soft">
        “{item.excerpt}”
      </blockquote>
      {item.suggestedAge || item.suggestedDescription ? (
        <p className="mt-2 text-xs text-ink-muted">
          Solo datos explícitos en el fragmento:{" "}
          {item.suggestedAge ? `posible edad ${item.suggestedAge}` : ""}
          {item.suggestedAge && item.suggestedDescription ? " · " : ""}
          {item.suggestedDescription ? "posible descripción" : ""}
        </p>
      ) : null}
      <a
        className="mt-2 inline-block text-xs text-accent underline"
        href={`/books/${bookId}/sections/${item.sectionId}?find=${encodeURIComponent(item.suggestedName)}`}
      >
        Abrir evidencia en el editor
      </a>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="suggestionId" value={item.id} />
        <button
          className="btn btn-primary btn-sm"
          name="decision"
          value="accept"
          disabled={pending}
        >
          Aceptar como ficha nueva
        </button>
        <button
          className="btn btn-ghost btn-sm text-danger"
          name="decision"
          value="discard"
          disabled={pending}
        >
          Descartar
        </button>
        <label className="field-label min-w-48">
          Fusionar con ficha existente
          <select className="field-input mt-1" name="characterId" defaultValue="">
            <option value="" disabled>
              Elegir personaje
            </option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary btn-sm"
          name="decision"
          value="merge"
          disabled={pending}
        >
          Fusionar
        </button>
      </form>
      {state.message ? (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {state.message}
        </p>
      ) : null}
    </article>
  );
}
export function CharacterAnalyzer({
  bookId,
  characters,
}: {
  bookId: string;
  characters: CharacterView[];
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const launchedTasks = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    const result = await getCharacterSuggestions(bookId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSnapshot(result);
  }, [bookId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("story-suggestions-refresh", handler);
    return () => window.removeEventListener("story-suggestions-refresh", handler);
  }, [refresh]);
  useEffect(() => {
    if (!snapshot) return;
    const pending = snapshot.pendingTaskIds.filter((id) => !launchedTasks.current.has(id));
    if (!pending.length) return;
    pending.forEach((id) => launchedTasks.current.add(id));
    void (async () => {
      for (let offset = 0; offset < pending.length; offset += 4) {
        await Promise.all(
          pending.slice(offset, offset + 4).map(async (taskId) => {
            try {
              await fetch("/api/story-analysis/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId }),
                keepalive: true,
              });
            } catch {
              /* la tarea permanece en cola */
            }
          }),
        );
      }
      await refresh();
    })();
  }, [snapshot, refresh]);
  const reanalyze = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const queued = await queueBookCharacterAnalysis(bookId);
      if (!queued.ok) {
        setError(queued.error);
        return;
      }
      for (let offset = 0; offset < queued.taskIds.length; offset += 4) {
        await Promise.all(
          queued.taskIds.slice(offset, offset + 4).map(async (taskId) => {
            try {
              await fetch("/api/story-analysis/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId }),
                keepalive: true,
              });
            } catch {
              /* queda pendiente en la cola */
            }
          }),
        );
      }
      await refresh();
      setNotice(
        `Revisión completa solicitada para ${queued.count} secciones. Las sugerencias quedan pendientes de tu revisión.`,
      );
    } catch {
      setError("No se pudo iniciar la revisión completa.");
    } finally {
      setLoading(false);
    }
  };
  const taskCounts = snapshot?.tasks ?? {};
  return (
    <section className="panel p-5" aria-labelledby="character-analysis-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-label">Asistencia narrativa · procesamiento por sección</p>
          <h2 id="character-analysis-title" className="mt-1 font-serif text-xl text-ink">
            Sugerencias de personajes
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Los cambios guardados se ponen en cola y se analizan en una petición independiente. No
            se escanea el libro mientras escribes. La detección es heurística: confirma cada
            resultado y su evidencia.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reanalyze} disabled={loading}>
          {loading ? "Encolando revisión…" : "Volver a analizar el libro"}
        </button>
      </div>
      {snapshot ? (
        <p className="mt-3 text-xs text-ink-muted" role="status">
          Cola: {taskCounts.PENDING ?? 0} pendientes · {taskCounts.PROCESSING ?? 0} en proceso ·{" "}
          {taskCounts.FAILED ?? 0} con error · {taskCounts.COMPLETED ?? 0} completadas.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {notice}
        </p>
      ) : null}
      {snapshot ? (
        <div className="mt-4 space-y-3">
          {snapshot.suggestions.length ? (
            snapshot.suggestions.map((item) => (
              <SuggestionCard key={item.id} item={item} bookId={bookId} characters={characters} />
            ))
          ) : (
            <p className="rounded-lg bg-surface-subtle p-4 text-sm text-ink-muted">
              No hay sugerencias pendientes. Las fichas aprobadas, descartadas y fusionadas se
              conservan como decisiones revisadas.
            </p>
          )}
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-ink-muted">Cargando sugerencias…</p>
      ) : null}
    </section>
  );
}
