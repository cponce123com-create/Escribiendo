import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { loadNarrativeContinuity } from "@/lib/books/narrative-continuity";
import {
  analyzeNarrativeSectionAction,
  decideNarrativeFindingAction,
  reviewNarrativeFactAction,
  updateNarrativeFactRecordAction,
} from "@/lib/books/narrative-continuity-actions";

export const metadata: Metadata = {
  title: "Continuidad narrativa",
  description: "Registro local y versionado de evidencia narrativa e inconsistencias posibles.",
};

const MODE_LABEL: Record<string, string> = {
  NARRATION: "Narración",
  DIALOGUE: "Diálogo (afirmación de personaje)",
  RECOLLECTION: "Recuerdo",
  HYPOTHESIS: "Hipótesis o percepción incierta",
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Pendiente",
  CONFIRMED: "Contradicción confirmada",
  TEXT_CORRECTED: "Texto corregido manualmente",
  IGNORED: "Ignorada",
  INTENTIONAL: "Intencional",
  FACT_UPDATED: "Registro actualizado",
};
const FACT_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Propuesto; falta confirmar",
  CONFIRMED: "Confirmado por el autor",
  REJECTED: "Descartado por el autor",
  STALE: "Versión anterior",
};

function editorHref(
  bookId: string,
  sectionId: string,
  start: number,
  end: number,
  version: number,
): string {
  const query = new URLSearchParams({
    findingStart: String(start),
    findingEnd: String(end),
    findingVersion: String(version),
  });
  return `/books/${bookId}/sections/${sectionId}?${query.toString()}`;
}

function formatLimaDate(value: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(value);
}

function FactEvidence({
  bookId,
  fact,
}: {
  bookId: string;
  fact: {
    id: string;
    sectionId: string;
    sectionTitle: string;
    contentVersion: number;
    factType: string;
    subjectLabel: string;
    valueText: string;
    sourceValueText: string;
    evidenceMode: string;
    confidence: number;
    startOffset: number;
    endOffset: number;
    exactQuote: string;
    reviewStatus: string;
  };
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span className="font-semibold text-ink">{fact.sectionTitle}</span>
        <span>v{fact.contentVersion}</span>
        <span>{MODE_LABEL[fact.evidenceMode] ?? fact.evidenceMode}</span>
        <span>{Math.round(fact.confidence * 100)}% heurístico</span>
        <span>{FACT_STATUS_LABEL[fact.reviewStatus] ?? fact.reviewStatus}</span>
      </div>
      <blockquote className="my-3 border-l-2 border-accent pl-3 text-sm leading-relaxed text-ink">
        “{fact.exactQuote}”
      </blockquote>
      <p className="text-sm">
        <span className="font-medium">{fact.subjectLabel}</span>: {fact.valueText}
        {fact.sourceValueText !== fact.valueText ? (
          <span className="ml-2 text-xs text-ink-muted">
            (detección original: {fact.sourceValueText}; valor del autor)
          </span>
        ) : null}
      </p>
      <Link
        className="mt-3 inline-flex text-sm font-medium text-accent underline underline-offset-2"
        href={editorHref(
          bookId,
          fact.sectionId,
          fact.startOffset,
          fact.endOffset,
          fact.contentVersion,
        )}
      >
        Revisar cita exacta en el editor →
      </Link>
    </div>
  );
}

export default async function NarrativeContinuityPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const session = await requireSession();
  const { bookId } = await params;
  const data = await loadNarrativeContinuity(session, bookId);
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-ghost btn-sm" href={`/books/${bookId}/analysis`}>
            ← Análisis editorial
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/books/${bookId}`}>
            Volver al libro
          </Link>
        </div>
        <span className="text-xs text-ink-muted">
          Motor local · reglas {data.facts[0]?.ruleVersion ?? "continuity-1.0.0"}
        </span>
      </div>

      <header className="panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Fase 3 · Continuidad
        </p>
        <h1 className="mt-2 font-serif text-3xl text-ink">
          Detector de inconsistencias narrativas
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-ink-muted">
          Busca diferencias explícitas en evidencia literal de cada capítulo. No usa APIs de
          inteligencia artificial ni cambia el manuscrito. El diálogo, los recuerdos y las hipótesis
          se etiquetan por separado y no se tratan como canon hasta que tú confirmes el registro.
          Las fechas se comparan solo cuando están explícitas en el texto; las fechas de interfaz de
          la aplicación usan America/Lima.
        </p>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumen del análisis de continuidad"
      >
        {[
          [
            "Capítulos analizados",
            `${data.counts.chaptersAnalyzed} / ${data.counts.totalChapters}`,
          ],
          ["Hechos con evidencia", String(data.counts.facts)],
          ["Posibles inconsistencias", String(data.counts.findings)],
          ["Por revisar", String(data.counts.open)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs text-ink-muted">{label}</p>
            <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="space-y-4" aria-label="Navegación de capítulos">
          <details open className="panel p-4">
            <summary className="cursor-pointer list-none font-semibold text-ink">
              Capítulos y análisis{" "}
              <span className="ml-1 text-xs font-normal text-ink-muted">(plegar)</span>
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Analiza un capítulo a la vez. Si su contenido cambia, su hash deja de coincidir y
              debes volver a analizar esa versión.
            </p>
            <ol className="mt-3 space-y-3">
              {data.sections.map((section, index) => (
                <li key={section.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-ink-muted">
                        {index + 1}. {section.type} · v{section.version}
                      </p>
                      <Link
                        className="mt-1 block text-sm font-medium text-ink underline underline-offset-2"
                        href={`/books/${bookId}/sections/${section.id}`}
                      >
                        {section.title}
                      </Link>
                    </div>
                    <span className="text-xs text-ink-muted">
                      {section.analyzed
                        ? `${section.factCount} ${section.factCount === 1 ? "hecho" : "hechos"}`
                        : "Sin analizar"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={analyzeNarrativeSectionAction}>
                      <input type="hidden" name="bookId" value={bookId} />
                      <input type="hidden" name="sectionId" value={section.id} />
                      <button className="btn btn-secondary btn-sm" type="submit">
                        {section.analyzed ? "Reanalizar versión" : "Analizar capítulo"}
                      </button>
                    </form>
                    <Link
                      className="btn btn-ghost btn-sm"
                      href={`/books/${bookId}/sections/${section.id}`}
                    >
                      Abrir
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </details>
          <div className="rounded-lg border border-line bg-paper p-4 text-xs leading-relaxed text-ink-muted">
            <p className="font-semibold text-ink">Cobertura actual</p>
            <p className="mt-2">
              El detector reconoce color de ojos/cabello, edades numéricas y año de nacimiento;
              también reconoce fechas numéricas explícitas, filiación padre/madre y apellidos
              declarados, y señala variantes ortográficas cercanas a nombres y lugares registrados.
            </p>
            <p className="mt-2">
              No deduce parentescos de coapariciones ni fusiona personajes/lugares automáticamente.
              Se abstiene si el candidato coincide con varias entidades.
            </p>
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <section aria-labelledby="findings-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="findings-title" className="font-serif text-2xl text-ink">
                  Alertas para revisar
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Son indicios, no correcciones obligatorias ni juicios de calidad literaria.
                </p>
              </div>
              <Link className="text-sm text-accent underline" href={`/books/${bookId}/analysis`}>
                Ver análisis editorial
              </Link>
            </div>
            {data.findings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-paper p-6 text-sm text-ink-muted">
                No hay alertas activas en las versiones analizadas. Analiza capítulos desde el panel
                izquierdo; cero alertas no significa que todo el manuscrito esté verificado.
              </div>
            ) : (
              <ul className="space-y-4">
                {data.findings.map((finding, index) => (
                  <li
                    key={finding.findingKey}
                    id={`finding-${finding.findingKey}`}
                    className="panel p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                          {finding.type === "CHRONOLOGY"
                            ? "Cronología"
                            : finding.type === "NAME_VARIANT"
                              ? "Nombre similar"
                              : finding.type === "PLACE_VARIANT"
                                ? "Lugar similar"
                                : "Atributo físico"}{" "}
                          · alerta {index + 1}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-ink">{finding.title}</h3>
                      </div>
                      <span className="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink-muted">
                        {Math.round(finding.confidence * 100)}% evidencia narrativa explícita
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      {finding.explanation}
                    </p>
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      <FactEvidence bookId={bookId} fact={finding.factA} />
                      {finding.factB ? <FactEvidence bookId={bookId} fact={finding.factB} /> : null}
                    </div>
                    {finding.decision ? (
                      <p className="mt-3 rounded bg-ink/5 px-3 py-2 text-sm text-ink">
                        Decisión v{finding.decision.decisionVersion}:{" "}
                        <strong>
                          {STATUS_LABEL[finding.decision.status] ?? finding.decision.status}
                        </strong>
                        {finding.decision.note ? ` — ${finding.decision.note}` : ""}
                      </p>
                    ) : null}
                    {finding.decision?.history.length ? (
                      <details className="mt-3 rounded-lg border border-line p-3">
                        <summary className="cursor-pointer text-sm font-medium text-ink">
                          Historial de decisiones ({finding.decision.history.length})
                        </summary>
                        <ol className="mt-3 space-y-2 text-xs text-ink-muted">
                          {finding.decision.history.map((item) => (
                            <li key={`${finding.findingKey}-${item.version}`}>
                              v{item.version} · {STATUS_LABEL[item.status] ?? item.status} ·{" "}
                              {item.actorName} · {formatLimaDate(item.createdAt)}
                              {item.note ? ` — ${item.note}` : ""}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                    <form
                      action={decideNarrativeFindingAction}
                      className="mt-4 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)_auto]"
                    >
                      <input type="hidden" name="bookId" value={bookId} />
                      <input type="hidden" name="findingKey" value={finding.findingKey} />
                      <label className="sr-only" htmlFor={`decision-${finding.findingKey}`}>
                        Decisión editorial
                      </label>
                      <select
                        id={`decision-${finding.findingKey}`}
                        name="status"
                        className="input"
                        defaultValue={finding.decision?.status ?? "CONFIRMED"}
                      >
                        <option value="CONFIRMED">Confirmar contradicción</option>
                        <option value="TEXT_CORRECTED">Texto corregido manualmente</option>
                        <option value="IGNORED">Ignorar advertencia</option>
                        <option value="INTENTIONAL">Marcar como intencional</option>
                        <option value="FACT_UPDATED">Registro de hechos actualizado</option>
                      </select>
                      <label className="sr-only" htmlFor={`note-${finding.findingKey}`}>
                        Nota editorial opcional
                      </label>
                      <input
                        id={`note-${finding.findingKey}`}
                        name="note"
                        className="input"
                        maxLength={500}
                        placeholder="Nota opcional (máx. 500 caracteres)"
                        defaultValue={finding.decision?.note ?? ""}
                      />
                      <button className="btn btn-primary btn-sm" type="submit">
                        Guardar decisión
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="facts-title">
            <h2 id="facts-title" className="font-serif text-2xl text-ink">
              Registro de hechos y afirmaciones
            </h2>
            <p className="mb-3 mt-1 text-sm text-ink-muted">
              Cada entrada conserva capítulo, hash/versión, modo de evidencia, cita literal y
              offsets del editor. Confirmar un diálogo es una decisión autoral explícita.
            </p>
            {data.facts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-paper p-5 text-sm text-ink-muted">
                Aún no hay hechos extraídos. Analiza uno o más capítulos en el panel izquierdo.
              </div>
            ) : (
              <ul className="space-y-3">
                {data.facts.map((fact) => (
                  <li key={fact.id} className="panel p-4">
                    <FactEvidence bookId={bookId} fact={fact} />
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <form
                        action={reviewNarrativeFactAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="bookId" value={bookId} />
                        <input type="hidden" name="factId" value={fact.id} />
                        <button
                          className="btn btn-secondary btn-sm"
                          name="status"
                          value="CONFIRMED"
                          type="submit"
                        >
                          Confirmar como hecho
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          name="status"
                          value="REJECTED"
                          type="submit"
                        >
                          Descartar afirmación
                        </button>
                      </form>
                      <form
                        action={updateNarrativeFactRecordAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="bookId" value={bookId} />
                        <input type="hidden" name="factId" value={fact.id} />
                        <label className="min-w-48 flex-1 text-xs text-ink-muted">
                          Valor canónico del autor
                          <input
                            className="input mt-1 w-full"
                            name="canonicalValue"
                            maxLength={300}
                            required
                            defaultValue={fact.valueText}
                          />
                        </label>
                        <button className="btn btn-secondary btn-sm" type="submit">
                          Actualizar registro
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
