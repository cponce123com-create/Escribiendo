"use client";
import { useState } from "react";
import { analyzeBookCharacters } from "@/lib/story/character-analysis-actions";
import { createCharacterAction } from "@/lib/story/character-actions";
import { useActionState } from "react";
import type { CharacterCandidate } from "@/lib/story/character-analysis";
import { initialActionState } from "@/lib/action-state";
function AcceptCandidate({ candidate, bookId }: { candidate: CharacterCandidate; bookId: string }) {
  const [state, action, pending] = useActionState(createCharacterAction, initialActionState);
  const [name, setName] = useState(candidate.name);
  const [editing, setEditing] = useState(false);
  return (
    <article className="rounded-xl border border-line bg-white/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="meta-label">
            {candidate.mentions} menciones · confianza orientativa{" "}
            {Math.round(candidate.confidence * 100)}%
          </p>
          <h3 className="mt-1 font-serif text-lg text-ink">{name}</h3>
        </div>
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">
          {candidate.role === "PROTAGONIST"
            ? "Posible protagonista"
            : candidate.role === "ANTAGONIST"
              ? "Posible antagonista"
              : candidate.role === "SECONDARY"
                ? "Posible principal"
                : "Por clasificar"}
        </span>
      </div>
      {candidate.evidence.slice(0, 3).map((e, i) => (
        <blockquote key={i} className="mt-3 border-l-2 border-accent/40 pl-3 text-sm text-ink-soft">
          <p>“{e.excerpt}”</p>
          <footer className="mt-1 text-xs text-ink-muted">
            {e.section} · {Math.round(e.confidence * 100)}% ·{" "}
            {e.kind === "physical" ? "descripción" : e.kind === "dialogue" ? "diálogo" : "mención"}
          </footer>
        </blockquote>
      ))}
      {candidate.age || candidate.description ? (
        <p className="mt-3 text-xs text-ink-muted">
          Datos sugeridos con evidencia: {candidate.age ? `edad ${candidate.age}` : ""}
          {candidate.age && candidate.description ? " · " : ""}
          {candidate.description ? "descripción física (ver fragmento)" : ""}
        </p>
      ) : null}
      {editing ? (
        <div className="mt-3">
          <label className="field-label">Editar nombre sugerido</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}
      <form action={action} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="role" value={candidate.role} />
        <input type="hidden" name="age" value={candidate.age ?? ""} />
        <input type="hidden" name="description" value={candidate.description ?? ""} />
        <input type="hidden" name="summary" value="" />
        <input type="hidden" name="occupation" value="" />
        <input type="hidden" name="personality" value="" />
        <input type="hidden" name="motivation" value="" />
        <input type="hidden" name="conflict" value="" />
        <input type="hidden" name="arc" value="" />
        <input type="hidden" name="notes" value="" />
        <button className="btn btn-primary btn-sm" disabled={pending} type="submit">
          {pending ? "Guardando…" : "Aceptar propuesta"}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Listo" : "Editar"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={(e) => e.currentTarget.closest("article")?.remove()}
        >
          Descartar
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
export function CharacterAnalyzer({ bookId }: { bookId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState<CharacterCandidate[] | null>(null);
  async function run() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const r = await analyzeBookCharacters(bookId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setItems(r.candidates);
      setNotice(r.notice);
    } catch {
      setError("No se pudo analizar el libro. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="panel p-5" aria-labelledby="character-analysis-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-label">Asistencia narrativa · sin enviar texto a terceros</p>
          <h2 id="character-analysis-title" className="mt-1 font-serif text-xl text-ink">
            Detectar personajes en el manuscrito
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Analiza capítulos, prólogos y otras secciones narrativas. Las coincidencias, edades y
            descripciones aparecen como sugerencias con fragmentos y nivel de confianza; tú decides.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? "Analizando manuscrito…" : "Analizar manuscrito y detectar personajes"}
        </button>
      </div>
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
      {items ? (
        <div className="mt-4 space-y-3">
          {items.length ? (
            items.map((item, i) => (
              <AcceptCandidate key={`${item.name}-${i}`} candidate={item} bookId={bookId} />
            ))
          ) : (
            <p className="rounded-lg bg-surface-subtle p-4 text-sm text-ink-muted">
              No se encontraron nuevos personajes con suficiente evidencia. La herramienta prioriza
              precisión y puede omitir menciones ambiguas.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
