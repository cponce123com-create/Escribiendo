import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getStoryBookOption, listStoryBooks } from "@/lib/story/queries";
import { guardStorySchema } from "@/lib/story/schema-guard";
import { getNarrativeDashboard } from "@/lib/story/narrative-queries";

export const metadata: Metadata = { title: "Análisis narrativo" };

const RELATION_LABELS: Record<string, string> = {
  FAMILY: "Familiar",
  FRIENDSHIP: "Amistad",
  ROMANCE: "Sentimental",
  RIVALRY: "Rivalidad",
  CONFLICT: "Conflicto",
  ALLIANCE: "Alianza",
  OTHER: "Otro vínculo",
};
const STAGES: Record<string, string[]> = {
  FREE: ["Estructura libre"],
  THREE_ACTS: ["Acto I · Planteamiento", "Acto II · Confrontación", "Acto III · Resolución"],
  FIVE_ACTS: ["Exposición", "Acción ascendente", "Clímax", "Acción descendente", "Desenlace"],
  HERO_JOURNEY: [
    "Mundo ordinario",
    "Llamada a la aventura",
    "Pruebas y aliados",
    "Ordalía",
    "Regreso con el elixir",
  ],
};

interface PageProps {
  searchParams: Promise<{ book?: string; structure?: string }>;
}

export default async function NarrativePage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const [books, selectedBook] = await guardStorySchema(() =>
    Promise.all([listStoryBooks(session), getStoryBookOption(session, params.book)]),
  );
  const dashboard = selectedBook
    ? await guardStorySchema(() => getNarrativeDashboard(session, selectedBook.id))
    : null;
  const structure = STAGES[params.structure ?? "FREE"] ? (params.structure ?? "FREE") : "FREE";
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          Herramientas ·{" "}
          {selectedBook ? (
            <Link className="underline" href={`/books/${selectedBook.id}`}>
              {selectedBook.title}
            </Link>
          ) : (
            "Análisis narrativo"
          )}
        </p>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          Personajes, diálogos y cronología
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
          Una mesa de planificación que separa evidencia del manuscrito y decisiones del autor. Las
          relaciones solo aparecen cuando están definidas manualmente; las atribuciones de diálogo
          se muestran como sugerencias revisables.
        </p>
      </header>
      <section className="panel filter-panel p-5" aria-label="Seleccionar libro">
        <form method="get" className="studio-filters">
          <div>
            <label className="field-label" htmlFor="narrative-book">
              Libro
            </label>
            <select
              id="narrative-book"
              name="book"
              className="field-input"
              defaultValue={selectedBook?.id ?? ""}
              required
            >
              <option value="" disabled>
                Elige un libro
              </option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>
          <div className="studio-filter-actions">
            <button className="btn btn-primary" type="submit">
              Analizar
            </button>
            <Link className="btn btn-ghost" href="/planning">
              Ir a planificación
            </Link>
          </div>
        </form>
      </section>
      {!dashboard ? (
        <section className="panel p-10 text-center">
          <h2 className="font-serif text-2xl text-ink">Selecciona un libro para comenzar</h2>
          <p className="mt-2 text-sm text-ink-muted">
            El análisis se ejecuta localmente sobre los capítulos visibles y no modifica el
            manuscrito.
          </p>
        </section>
      ) : (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Resumen del análisis"
          >
            {[
              ["Capítulos", dashboard.chapters.length],
              ["Intervenciones", dashboard.interventions.length],
              ["Personajes", dashboard.characters.length],
              ["Vínculos manuales", dashboard.relations.length],
            ].map(([label, value]) => (
              <div className="panel p-5" key={label}>
                <p className="meta-label">{label}</p>
                <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
              </div>
            ))}
          </section>
          <section className="panel p-6" aria-labelledby="characters-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Módulo A</p>
                <h2 id="characters-title" className="mt-1 font-serif text-2xl text-ink">
                  Fichas ampliadas
                </h2>
              </div>
              <Link
                className="btn btn-secondary btn-sm"
                href={`/characters?book=${dashboard.book.id}`}
              >
                Editar fichas
              </Link>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Las apariciones, primera y última presencia son detecciones automáticas. Los alias se
              leen de la nota con el formato «Alias: …» y requieren confirmación del autor.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                    <th className="p-2">Personaje</th>
                    <th className="p-2">Alias detectados</th>
                    <th className="p-2">Apariciones</th>
                    <th className="p-2">Primera aparición</th>
                    <th className="p-2">Última aparición</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.characters.map((character) => (
                    <tr className="border-b border-line/70" key={character.id}>
                      <td className="p-2 font-semibold text-ink">{character.name}</td>
                      <td className="p-2 text-ink-soft">
                        {character.aliases.length ? character.aliases.join(", ") : "—"}
                      </td>
                      <td className="p-2 text-ink-soft">{character.appearances}</td>
                      <td className="p-2 text-ink-soft">
                        {character.firstAppearance ?? "No detectada"}
                      </td>
                      <td className="p-2 text-ink-soft">
                        {character.lastAppearance ?? "No detectada"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel p-6" aria-labelledby="dialogue-title">
            <p className="eyebrow">Módulo C</p>
            <h2 id="dialogue-title" className="mt-1 font-serif text-2xl text-ink">
              Analizador de diálogos
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Detecta rayas y comillas; solo propone hablante cuando encuentra una atribución
              explícita con suficiente confianza.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                    <th className="p-2">Capítulo</th>
                    <th className="p-2">Intervenciones</th>
                    <th className="p-2">Palabras dialogadas</th>
                    <th className="p-2">% diálogo</th>
                    <th className="p-2">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.chapters.map((chapter) => (
                    <tr className="border-b border-line/70" key={chapter.sectionId}>
                      <td className="p-2 font-semibold text-ink">{chapter.title}</td>
                      <td className="p-2">{chapter.interventions}</td>
                      <td className="p-2">{chapter.dialogueWords}</td>
                      <td className="p-2">{chapter.dialoguePercentage}%</td>
                      <td className="p-2">{chapter.meanInterventionWords} palabras</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="font-serif text-lg text-ink">Intervenciones extensas</h3>
                <ul className="mt-3 space-y-2">
                  {dashboard.interventions
                    .filter((item) => item.long)
                    .slice(0, 8)
                    .map((item, index) => (
                      <li
                        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
                        key={`${item.sectionId}-${index}`}
                      >
                        <strong>{item.sectionTitle}</strong>
                        {item.speaker ? ` · ${item.speaker}` : " · hablante no identificado"}
                        <p className="mt-1 text-ink-soft">
                          {item.text.slice(0, 220)}
                          {item.text.length > 220 ? "…" : ""}
                        </p>
                        <span className="text-xs text-ink-muted">
                          {item.words} palabras
                          {item.confidence
                            ? ` · confianza ${Math.round(item.confidence * 100)}%`
                            : ""}
                        </span>
                      </li>
                    ))}
                  {!dashboard.interventions.some((item) => item.long) ? (
                    <li className="text-sm text-ink-muted">
                      No se detectaron intervenciones de más de 80 palabras.
                    </li>
                  ) : null}
                </ul>
              </div>
              <div>
                <h3 className="font-serif text-lg text-ink">Patrones de atribución</h3>
                <ul className="mt-3 space-y-2">
                  {dashboard.attributionPatterns.map((pattern) => (
                    <li
                      key={pattern.label}
                      className="flex justify-between border-b border-line py-2 text-sm"
                    >
                      <span>{pattern.label}</span>
                      <strong>{pattern.count}</strong>
                    </li>
                  ))}
                  {!dashboard.attributionPatterns.length ? (
                    <li className="text-sm text-ink-muted">
                      No se detectaron patrones explícitos.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </section>
          <section className="panel p-6" aria-labelledby="relations-title">
            <p className="eyebrow">Módulo B</p>
            <h2 id="relations-title" className="mt-1 font-serif text-2xl text-ink">
              Mapa de personajes
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Solo se visualizan vínculos guardados por el escritor. La aparición conjunta no crea
              relaciones.
            </p>
            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border border-line bg-surface-subtle p-3">
                <svg
                  viewBox="0 0 620 260"
                  className="h-64 w-full"
                  role="img"
                  aria-label="Mapa de relaciones manuales"
                >
                  <text x="310" y="28" textAnchor="middle" className="fill-ink-muted text-[12px]">
                    {dashboard.relations.length
                      ? "Relaciones definidas en la ficha"
                      : "Sin relaciones manuales"}
                  </text>
                  {dashboard.characters.slice(0, 12).map((character, index) => {
                    const angle = (Math.PI * 2 * index) / Math.max(dashboard.characters.length, 1);
                    const x = 310 + Math.cos(angle) * 220;
                    const y = 140 + Math.sin(angle) * 90;
                    return (
                      <g key={character.id}>
                        <circle cx={x} cy={y} r="25" className="fill-white stroke-accent/50" />
                        <text x={x} y={y + 4} textAnchor="middle" className="fill-ink text-[10px]">
                          {character.name.slice(0, 14)}
                        </text>
                      </g>
                    );
                  })}
                  {dashboard.relations.slice(0, 20).map((relation, index) => {
                    const a = dashboard.characters.findIndex(
                      (item) => item.id === relation.source.id,
                    );
                    const b = dashboard.characters.findIndex(
                      (item) => item.id === relation.target.id,
                    );
                    if (a < 0 || b < 0) return null;
                    const angleA = (Math.PI * 2 * a) / Math.max(dashboard.characters.length, 1);
                    const angleB = (Math.PI * 2 * b) / Math.max(dashboard.characters.length, 1);
                    return (
                      <line
                        key={relation.id}
                        x1={310 + Math.cos(angleA) * 220}
                        y1={140 + Math.sin(angleA) * 90}
                        x2={310 + Math.cos(angleB) * 220}
                        y2={140 + Math.sin(angleB) * 90}
                        className="stroke-accent/60"
                        strokeWidth="2"
                        data-index={index}
                      />
                    );
                  })}
                </svg>
              </div>
              <ul className="space-y-2">
                {dashboard.relations.map((relation) => (
                  <li className="rounded-lg border border-line p-3 text-sm" key={relation.id}>
                    <strong>
                      {relation.source.name} — {RELATION_LABELS[relation.kind] ?? relation.kind} —{" "}
                      {relation.target.name}
                    </strong>
                    {relation.description ? (
                      <p className="mt-1 text-ink-muted">{relation.description}</p>
                    ) : null}
                  </li>
                ))}
                {!dashboard.relations.length ? (
                  <li className="text-sm text-ink-muted">
                    Añade relaciones desde la ficha de un personaje.
                  </li>
                ) : null}
              </ul>
            </div>
          </section>
          <section className="panel p-6" aria-labelledby="timeline-title">
            <p className="eyebrow">Módulo D</p>
            <h2 id="timeline-title" className="mt-1 font-serif text-2xl text-ink">
              Cronología narrativa
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              El orden narrativo corresponde al capítulo donde aparece el acontecimiento; el orden
              cronológico usa el número temporal editable de cada acontecimiento. Las sugerencias
              automáticas se mantienen diferenciadas.
            </p>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="font-serif text-lg text-ink">Orden narrativo</h3>
                <ol className="mt-3 space-y-3">
                  {[...dashboard.timeline]
                    .sort((a, b) => a.narrativeOrder - b.narrativeOrder)
                    .map((event) => (
                      <li className="border-l-2 border-accent/40 pl-4" key={`n-${event.id}`}>
                        <p className="font-semibold text-ink">{event.title}</p>
                        <p className="text-xs text-ink-muted">
                          {event.sectionTitle ?? "Sin capítulo"} · {event.characterName}
                          {event.suggested ? " · sugerencia automática" : " · confirmado por autor"}
                        </p>
                        {event.sourceExcerpt ? (
                          <p className="mt-1 text-sm text-ink-soft">{event.sourceExcerpt}</p>
                        ) : null}
                      </li>
                    ))}
                  {!dashboard.timeline.length ? (
                    <li className="text-sm text-ink-muted">
                      Aún no hay acontecimientos. Añádelos desde la ficha del personaje.
                    </li>
                  ) : null}
                </ol>
              </div>
              <div>
                <h3 className="font-serif text-lg text-ink">Orden cronológico</h3>
                <ol className="mt-3 space-y-3">
                  {[...dashboard.timeline]
                    .sort((a, b) => a.chronologicalOrder - b.chronologicalOrder)
                    .map((event) => (
                      <li className="border-l-2 border-accent/40 pl-4" key={`c-${event.id}`}>
                        <p className="font-semibold text-ink">{event.title}</p>
                        <p className="text-xs text-ink-muted">
                          Posición temporal {event.chronologicalOrder || "sin decidir"} ·{" "}
                          {event.characterName}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {event.details ??
                            "Sin fecha o intervalo descrito; completa el acontecimiento desde la ficha."}
                        </p>
                      </li>
                    ))}
                </ol>
              </div>
            </div>
          </section>
          <section className="panel p-6" aria-labelledby="structure-title">
            <p className="eyebrow">Módulo E</p>
            <h2 id="structure-title" className="mt-1 font-serif text-2xl text-ink">
              Estructura narrativa opcional
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Las plantillas son ayudas de planificación, no requisitos para escribir. Asocia
              capítulos y escenas a etapas desde las tarjetas de planificación.
            </p>
            <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="book" value={dashboard.book.id} />
              <div>
                <label className="field-label" htmlFor="structure">
                  Plantilla
                </label>
                <select id="structure" name="structure" className="field-input">
                  <option value="FREE">Estructura libre</option>
                  <option value="THREE_ACTS">Tres actos</option>
                  <option value="FIVE_ACTS">Cinco actos</option>
                  <option value="HERO_JOURNEY">Viaje del héroe</option>
                </select>
              </div>
              <button className="btn btn-secondary" type="submit">
                Aplicar vista
              </button>
            </form>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {STAGES[structure].map((stage, index) => (
                <article className="rounded-lg border border-line p-4" key={stage}>
                  <p className="meta-label">Etapa {index + 1}</p>
                  <h3 className="mt-1 font-serif text-lg text-ink">{stage}</h3>
                  <p className="mt-2 text-xs text-ink-muted">
                    Asocia aquí capítulos o escenas desde{" "}
                    <Link className="underline" href={`/planning?book=${dashboard.book.id}`}>
                      planificación
                    </Link>
                    .
                  </p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
