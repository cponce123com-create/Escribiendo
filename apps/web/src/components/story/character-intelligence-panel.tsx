"use client";
import { useCallback, useEffect, useState, useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import {
  getCharacterIntelligence,
  saveCharacterEvent,
  saveCharacterRelation,
  deleteCharacterEvent,
  deleteCharacterRelation,
} from "@/lib/story/character-intelligence-actions";
import type { CharacterView } from "@/lib/story/queries";
type Data = Awaited<ReturnType<typeof getCharacterIntelligence>>;
const RELATIONS = [
  ["FAMILY", "Familiar"],
  ["FRIENDSHIP", "Amistad"],
  ["ROMANCE", "Romance"],
  ["RIVALRY", "Rivalidad"],
  ["CONFLICT", "Conflicto"],
  ["ALLIANCE", "Alianza"],
  ["OTHER", "Otra"],
] as const;
const kindLabel = (kind: string) => RELATIONS.find((x) => x[0] === kind)?.[1] ?? kind;

function DeleteRelationForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteCharacterRelation, initialActionState);
  useEffect(() => {
    if (state.status === "success")
      window.dispatchEvent(new Event("character-intelligence-refresh"));
  }, [state]);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="relationId" value={id} />
      <button disabled={pending} className="text-xs text-danger underline">
        {pending ? "Eliminando…" : "Eliminar"}
      </button>
      {state.message ? (
        <span role="status" className="text-xs text-ink-muted">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
function DeleteEventForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteCharacterEvent, initialActionState);
  useEffect(() => {
    if (state.status === "success")
      window.dispatchEvent(new Event("character-intelligence-refresh"));
  }, [state]);
  return (
    <form action={action} className="mt-1">
      <input type="hidden" name="eventId" value={id} />
      <button disabled={pending} className="text-xs text-danger underline">
        {pending ? "Eliminando…" : "Quitar"}
      </button>
      {state.message ? (
        <span role="status" className="ml-2 text-xs text-ink-muted">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function EventForm({
  bookId,
  characterId,
  title = "",
  details = "",
  sectionId = "",
  excerpt = "",
  suggested = false,
  sequence = 0,
}: {
  bookId: string;
  characterId: string;
  title?: string;
  details?: string;
  sectionId?: string;
  excerpt?: string;
  suggested?: boolean;
  sequence?: number;
}) {
  const [state, action, pending] = useActionState(saveCharacterEvent, initialActionState);
  useEffect(() => {
    if (state.status === "success")
      window.dispatchEvent(new Event("character-intelligence-refresh"));
  }, [state]);
  return (
    <form action={action} className="mt-2 rounded-lg border border-line p-3">
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="characterId" value={characterId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="sourceExcerpt" value={excerpt} />
      <input type="hidden" name="suggested" value={String(suggested)} />
      <label className="field-label mt-2">
        Orden temporal
        <input
          className="field-input mt-1"
          name="sequence"
          type="number"
          min="0"
          max="9999"
          defaultValue={sequence}
        />
      </label>
      {suggested ? (
        <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-xs text-ink-muted">
          Evidencia: “{excerpt}”
        </blockquote>
      ) : null}
      <label className="field-label">Acontecimiento</label>
      <input
        className="field-input"
        name="title"
        defaultValue={title}
        required
        maxLength={200}
        placeholder="Decisión, cambio o hito"
      />
      <textarea
        className="field-input mt-2 min-h-16"
        name="details"
        defaultValue={details}
        placeholder="Notas opcionales del autor"
      />
      <div className="mt-2 flex items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {suggested ? "Conservar sugerencia" : "Añadir a la línea temporal"}
        </button>
        {state.message ? (
          <span role="status" className="text-xs text-ink-muted">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
export function CharacterIntelligencePanel({
  character,
  bookId,
  canManage,
}: {
  character: CharacterView;
  bookId: string;
  canManage: boolean;
}) {
  const [data, setData] = useState<Exclude<Data, { ok: false }> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [relState, relAction, relPending] = useActionState(
    saveCharacterRelation,
    initialActionState,
  );
  const load = useCallback(
    async (force = false) => {
      if (!force && (data || loading)) return;
      setLoading(true);
      try {
        const d = await getCharacterIntelligence(bookId, character.id);
        if (!d.ok) setError(d.error);
        else setData(d);
      } catch {
        setError("No se pudo analizar este personaje.");
      } finally {
        setLoading(false);
      }
    },
    [bookId, character.id, data, loading],
  );
  useEffect(() => {
    const refresh = () => {
      setData(null);
      setError("");
      void load(true);
    };
    window.addEventListener("character-intelligence-refresh", refresh);
    return () => window.removeEventListener("character-intelligence-refresh", refresh);
  }, [load]);
  useEffect(() => {
    if (relState.status === "success")
      window.dispatchEvent(new Event("character-intelligence-refresh"));
  }, [relState]);
  return (
    <details
      className="mt-4 border-t border-line pt-3"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-accent">
        Inteligencia narrativa · apariciones, relaciones y evolución
      </summary>
      <div className="mt-4 space-y-6">
        {loading ? <p className="text-sm text-ink-muted">Analizando menciones…</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {data ? (
          <>
            <section>
              <h3 className="font-serif text-lg text-ink">Apariciones en el manuscrito</h3>
              <p className="mt-1 text-sm text-ink-muted">
                {data.appearances.length
                  ? `${data.appearances.reduce((n, a) => n + a.count, 0)} menciones aproximadas en ${data.appearances.length} secciones. Primera: ${data.appearances[0]?.title}. Última: ${data.appearances.at(-1)?.title}.`
                  : "No se encontraron menciones exactas del nombre de la ficha."}{" "}
                Los conteos son orientativos; alias no registrados pueden faltar.
              </p>
              <ul className="mt-3 space-y-2">
                {data.appearances.map((a) => (
                  <li key={a.sectionId} className="rounded-lg bg-surface-subtle p-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <a
                        className="font-semibold text-accent underline"
                        href={`/books/${bookId}/sections/${a.sectionId}?find=${encodeURIComponent(character.name)}`}
                      >
                        {a.title} · aprox. {a.count} mención(es) · abrir fragmento
                      </a>
                      {/escena|interludio/i.test(a.title) ? (
                        <span className="text-xs text-ink-muted">Posible escena relevante</span>
                      ) : null}
                    </div>
                    <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-sm text-ink-soft">
                      {a.excerpt}
                    </blockquote>
                    {a.dialogues.map((q, i) => (
                      <p key={i} className="mt-2 text-xs text-ink-muted">
                        Diálogo atribuido (revisar): “{q}”
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-serif text-lg text-ink">Posibles inconsistencias</h3>
              <p className="mt-1 text-xs text-ink-muted">
                Alertas heurísticas, no errores definitivos. Revisa contexto, saltos temporales,
                recuerdos y narradores poco fiables.
              </p>
              {data.alerts.length ? (
                <ul className="mt-2 space-y-2">
                  {data.alerts.map((a, i) => (
                    <li key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <strong className="text-sm">{a.message}</strong>
                      <p className="mt-1 text-xs text-ink-muted">{a.section}</p>
                      <blockquote className="mt-2 text-xs text-ink-soft">{a.evidence}</blockquote>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  No se detectaron contradicciones obvias en las reglas analizadas; esto no
                  garantiza continuidad completa.
                </p>
              )}
            </section>
            <section>
              <h3 className="font-serif text-lg text-ink">Mapa de relaciones</h3>
              <p className="mt-1 text-xs text-ink-muted">
                Las conexiones se guardan manualmente y están aisladas por libro.
              </p>
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-subtle p-3">
                <svg
                  viewBox="0 0 480 190"
                  role="img"
                  aria-label={`Mapa de relaciones de ${character.name}`}
                  className="h-44 w-full"
                >
                  {data.relations.map((r, i) => {
                    const related = r.sourceCharacterId === character.id ? r.target : r.source;
                    const n = Math.max(1, data.relations.length);
                    const angle = (2 * Math.PI * i) / n;
                    const x = 240 + 150 * Math.cos(angle),
                      y = 95 + 65 * Math.sin(angle);
                    return (
                      <g key={r.id}>
                        <line x1="240" y1="95" x2={x} y2={y} stroke="#8d7ab6" strokeWidth="2" />
                        <text
                          x={(240 + x) / 2}
                          y={(95 + y) / 2 - 6}
                          textAnchor="middle"
                          fontSize="11"
                          fill="#57456f"
                        >
                          {kindLabel(r.kind)}
                        </text>
                        <a
                          href={`/characters?book=${bookId}&q=${encodeURIComponent(related.name)}`}
                          aria-label={`Abrir ficha de ${related.name}`}
                        >
                          <circle cx={x} cy={y} r="28" fill="#fff" stroke="#b6a5cf" />
                          <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="#30303a">
                            {related.name.slice(0, 12)}
                          </text>
                        </a>
                      </g>
                    );
                  })}
                  <circle cx="240" cy="95" r="38" fill="#57456f" />
                  <text x="240" y="99" textAnchor="middle" fontSize="11" fill="white">
                    {character.name.slice(0, 15)}
                  </text>
                </svg>
                {data.relations.map((r) => (
                  <div
                    className="flex items-center justify-between border-t border-line py-2 text-sm"
                    key={r.id}
                  >
                    <span>
                      {r.source.name} — {kindLabel(r.kind)} — {r.target.name}
                      {r.description ? ` · ${r.description}` : ""}
                    </span>
                    {canManage ? <DeleteRelationForm id={r.id} /> : null}
                  </div>
                ))}
              </div>
              {canManage ? (
                <form action={relAction} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="bookId" value={bookId} />
                  <input type="hidden" name="sourceCharacterId" value={character.id} />
                  <label className="field-label">
                    Conectar con
                    <select
                      className="field-input mt-1"
                      name="targetCharacterId"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Elegir personaje
                      </option>
                      {data.characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Relación
                    <select className="field-input mt-1" name="kind">
                      {RELATIONS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    className="field-input sm:col-span-2"
                    name="description"
                    maxLength={300}
                    placeholder="Detalle opcional (p. ej. hermanos por parte de madre)"
                  />
                  <button className="btn btn-secondary btn-sm sm:col-span-2" disabled={relPending}>
                    Añadir o actualizar conexión
                  </button>
                  {relState.message ? (
                    <p role="status" className="text-xs text-ink-muted">
                      {relState.message}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </section>
            <section>
              <h3 className="font-serif text-lg text-ink">Evolución narrativa</h3>
              <ol className="mt-3 space-y-3 border-l-2 border-accent/30 pl-4">
                {data.storedEvents.map((e) => (
                  <li key={e.id} className="relative rounded-lg bg-surface-subtle p-3">
                    <span className="absolute -left-[1.42rem] top-4 size-2 rounded-full bg-accent" />
                    <strong className="text-sm">{e.title}</strong>
                    {e.suggested ? (
                      <span className="ml-2 text-xs text-ink-muted">sugerido</span>
                    ) : null}
                    {e.details ? <p className="mt-1 text-sm text-ink-soft">{e.details}</p> : null}
                    {e.sourceExcerpt ? (
                      <blockquote className="mt-2 text-xs text-ink-muted">
                        “{e.sourceExcerpt}”
                      </blockquote>
                    ) : null}
                    {e.sectionId ? (
                      <a
                        className="mt-2 inline-block text-xs text-accent underline"
                        href={`/books/${bookId}/sections/${e.sectionId}?find=${encodeURIComponent(character.name)}`}
                      >
                        Ir a la sección
                      </a>
                    ) : null}
                    {canManage ? <DeleteEventForm id={e.id} /> : null}
                  </li>
                ))}
              </ol>
              {canManage ? (
                <>
                  <h4 className="mt-4 text-sm font-semibold">
                    Sugerencias encontradas (decide cuáles conservar)
                  </h4>
                  {data.events.slice(0, 8).map((e, i) => (
                    <EventForm
                      key={`${e.sectionId}-${i}`}
                      bookId={bookId}
                      characterId={character.id}
                      sectionId={e.sectionId}
                      title={e.title}
                      excerpt={e.excerpt}
                      suggested
                    />
                  ))}
                  <EventForm bookId={bookId} characterId={character.id} />
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </details>
  );
}
