import { NarrativePlanningPanel } from "@/components/story/narrative-planning-panel";
import { loadNarrativePlanning } from "@/lib/story/narrative-planning-queries";
import { canPerform } from "@/lib/books/permissions";
import { formatNarrativePeriod } from "@/lib/story/narrative-planning";
import type { Metadata } from "next";
import { RelationshipMap } from "@/components/story/relationship-map";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getStoryBookOption, listStoryBooks } from "@/lib/story/queries";
import { guardStorySchema } from "@/lib/story/schema-guard";
import { getNarrativeDashboard } from "@/lib/story/narrative-queries";

export const metadata: Metadata = { title: "Análisis narrativo" };

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
  const planningData = selectedBook
    ? await guardStorySchema(() => loadNarrativePlanning(session, selectedBook.id))
    : null;
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          Herramientas ·{" "}
          {selectedBook ? (
            <Link className="underline" href={`/books/${selectedBook.id}/laboratorio`}>
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
            <RelationshipMap characters={dashboard.characters} relations={dashboard.relations} />
          </section>
          <section className="panel p-6" aria-labelledby="timeline-title">
            <p className="eyebrow">Módulo D</p>
            <h2 id="timeline-title" className="mt-1 font-serif text-2xl text-ink">
              Cronología narrativa
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              El orden narrativo corresponde al capítulo donde aparece el acontecimiento; el orden
              cronológico se ajusta con Subir y Bajar en el panel de acontecimientos. Las
              sugerencias automáticas se mantienen diferenciadas.
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
                    .map((event, index) => (
                      <li className="border-l-2 border-accent/40 pl-4" key={`c-${event.id}`}>
                        <p className="font-semibold text-ink">{event.title}</p>
                        <p className="text-xs text-ink-muted">
                          Posición temporal {index + 1} · {event.characterName}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {formatNarrativePeriod(event)}
                          {event.details ? ` · ${event.details}` : ""}
                        </p>
                      </li>
                    ))}
                </ol>
              </div>
            </div>
          </section>
          {planningData ? (
            <NarrativePlanningPanel
              data={planningData}
              canManage={canPerform(session.workspace.role, "story:manage")}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
