import Link from "next/link";
import { IgnoreAnalysisObservation } from "./ignore-analysis-observation";

export interface AnalysisTarget {
  sectionId: string;
  sectionTitle: string;
  contentVersion: number;
  startOffset: number;
  endOffset: number;
}

export interface StyleAnalysisItem extends AnalysisTarget {
  id: string;
  category: string;
  severity: "info" | "warning" | "error";
  confidence: number;
  message: string;
  explanation: string;
  matchedText?: string;
  suggestions?: readonly string[];
}

export interface RepetitionAnalysisItem {
  id: string;
  kind: "word" | "phrase" | "paragraph-similarity";
  scope: "chapter" | "book";
  algorithm: string;
  score: number;
  matchedText: string;
  message: string;
  explanation: string;
  first: AnalysisTarget;
  second: AnalysisTarget;
}

export interface ReadabilityAnalysisItem {
  sectionId: string;
  sectionTitle: string;
  wordCount: number;
  sentenceCount: number;
  syllableCount: number;
  paragraphCount: number;
  meanWordsPerSentence: number | null;
  meanCharactersPerWord: number | null;
  fernandezHuerta: number | null;
  szigrisztPazos: number | null;
  shortSample: boolean;
  paragraphDistribution: Readonly<Record<string, number>>;
}

export interface RhythmAnalysisItem {
  sectionId: string;
  sectionTitle: string;
  wordCount: number;
  paragraphCount: number;
  sentenceCount: number;
  meanParagraphWords: number | null;
  dialogueWordPercentage: number | null;
  nonDialogueNarrationWordPercentage: number | null;
  paragraphLengthDistribution: readonly { label: string; paragraphCount: number }[];
}

export interface BookAnalysisDashboardProps {
  bookId: string;
  userId: string;
  bookTitle: string;
  sectionsAnalyzed: number;
  omittedSections: number;
  styleFindings: readonly StyleAnalysisItem[];
  totalStyleFindings: number;
  repetitionFindings: readonly RepetitionAnalysisItem[];
  totalRepetitionFindings: number;
  readability: readonly ReadabilityAnalysisItem[];
  rhythm: readonly RhythmAnalysisItem[];
  chapterLengthVariation: {
    sectionCount: number;
    meanWords: number;
    standardDeviationWords: number;
    standardDeviationKind: "population";
    coefficientOfVariation: number | null;
  };
  rhythmNote: string;
  analysisWarning?: string | null;
  repetitionTruncated?: boolean;
}

function number(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits }).format(value);
}

function findingHref(bookId: string, target: AnalysisTarget): string {
  const query = new URLSearchParams({
    findingStart: String(target.startOffset),
    findingEnd: String(target.endOffset),
    findingVersion: String(target.contentVersion),
  });
  return `/books/${bookId}/sections/${target.sectionId}?${query.toString()}`;
}

function BarRow({
  label,
  value,
  max,
  valueLabel,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
}) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <li className="grid grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
      <span className="truncate text-ink-soft" title={label}>
        {label}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </span>
      <span className="text-right tabular-nums text-ink-muted">{valueLabel}</span>
    </li>
  );
}

function TargetLink({
  bookId,
  target,
  label,
}: {
  bookId: string;
  target: AnalysisTarget;
  label: string;
}) {
  return (
    <Link
      className="underline decoration-dotted underline-offset-4"
      href={findingHref(bookId, target)}
    >
      {label}: {target.sectionTitle}
    </Link>
  );
}

export function BookAnalysisDashboard({
  bookId,
  userId,
  bookTitle,
  sectionsAnalyzed,
  omittedSections,
  styleFindings,
  totalStyleFindings,
  repetitionFindings,
  totalRepetitionFindings,
  readability,
  rhythm,
  chapterLengthVariation,
  rhythmNote,
  analysisWarning,
  repetitionTruncated = false,
}: BookAnalysisDashboardProps) {
  const visibleStyleFindings = styleFindings.slice(0, 100);
  const visibleRepetitionFindings = repetitionFindings.slice(0, 100);
  const maxWords = Math.max(0, ...rhythm.map((chapter) => chapter.wordCount));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-3">
        <p className="eyebrow">Análisis editorial · Herramientas orientativas</p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          {bookTitle}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
          Revisa patrones formales y posibles repeticiones. Son sugerencias para decidir, no
          correcciones obligatorias ni medidas de la calidad literaria.
        </p>
      </header>

      {analysisWarning ? (
        <p className="alert" role="status">
          {analysisWarning}
        </p>
      ) : null}
      {omittedSections > 0 ? (
        <p className="alert" role="status">
          Se analizaron {number(sectionsAnalyzed)} secciones; se omitieron {number(omittedSections)}
          por límites de tamaño o porque su contenido no pudo validarse.
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="panel p-4 lg:sticky lg:top-24" aria-label="Navegación del análisis">
          <details open>
            <summary className="meta-label cursor-pointer select-none">Panel de análisis</summary>
            <nav className="mt-4 grid gap-2 text-sm" aria-label="Secciones del análisis">
              <a className="rounded px-2 py-1.5 text-ink-soft hover:bg-ink/5" href="#estilo">
                Corrector de estilo
              </a>
              <a className="rounded px-2 py-1.5 text-ink-soft hover:bg-ink/5" href="#repeticiones">
                Repeticiones
              </a>
              <a className="rounded px-2 py-1.5 text-ink-soft hover:bg-ink/5" href="#legibilidad">
                Legibilidad
              </a>
              <a className="rounded px-2 py-1.5 text-ink-soft hover:bg-ink/5" href="#ritmo">
                Ritmo narrativo
              </a>
            </nav>
          </details>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
            {number(sectionsAnalyzed)} secciones incluidas en este análisis.
          </p>
        </aside>

        <main className="min-w-0 space-y-5">
          <section
            id="estilo"
            className="panel scroll-mt-24 p-5 sm:p-6"
            aria-labelledby="style-heading"
          >
            <p className="meta-label">Sugerencias, no errores</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="style-heading" className="font-serif text-2xl text-ink">
                Corrector de estilo
              </h2>
              <span className="text-xs text-ink-muted">
                {number(totalStyleFindings)} observaciones
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Palabras y construcciones repetidas, muletillas, oraciones o párrafos extensos y
              patrones de puntuación. Cada señal puede reflejar una elección deliberada.
            </p>
            {visibleStyleFindings.length ? (
              <ol className="mt-5 space-y-3">
                {visibleStyleFindings.map((finding) => (
                  <IgnoreAnalysisObservation
                    key={finding.id}
                    storageKey={`escribiendo:analysis-ignore:${userId}:${bookId}:style:${finding.id}`}
                    title={finding.message}
                  >
                    <p className="font-medium text-ink">{finding.message}</p>
                    {finding.matchedText ? (
                      <blockquote className="mt-2 border-l-2 border-accent/60 pl-3 font-serif text-sm italic text-ink-soft">
                        «{finding.matchedText}»
                      </blockquote>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      {finding.explanation}
                    </p>
                    {finding.suggestions?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                        {finding.suggestions.map((suggestion) => (
                          <li key={suggestion}>{suggestion}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-3 text-xs text-ink-muted">
                      {finding.category} · Confianza heurística{" "}
                      {number(finding.confidence * 100, 0)}%
                    </p>
                    <p className="mt-2 text-sm">
                      <TargetLink bookId={bookId} target={finding} label="Ir al texto" />
                    </p>
                  </IgnoreAnalysisObservation>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-lg bg-ink/5 p-4 text-sm text-ink-soft">
                No se encontraron sugerencias con las reglas actuales. Eso no garantiza que el texto
                esté libre de aspectos revisables.
              </p>
            )}
            {totalStyleFindings > visibleStyleFindings.length ? (
              <p className="mt-3 text-xs text-ink-muted">
                Se muestran las primeras {number(visibleStyleFindings.length)} para mantener el
                panel ágil.
              </p>
            ) : null}
          </section>

          <section
            id="repeticiones"
            className="panel scroll-mt-24 p-5 sm:p-6"
            aria-labelledby="repetition-heading"
          >
            <p className="meta-label">Coincidencia textual, no semántica</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="repetition-heading" className="font-serif text-2xl text-ink">
                Detector de repeticiones
              </h2>
              <span className="text-xs text-ink-muted">
                {number(totalRepetitionFindings)} observaciones
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Detecta palabras o frases exactas y párrafos con vocabulario parecido, dentro de un
              capítulo o entre capítulos. La similitud no prueba que dos pasajes digan lo mismo.
            </p>
            {visibleRepetitionFindings.length ? (
              <ol className="mt-5 space-y-3">
                {visibleRepetitionFindings.map((finding) => (
                  <IgnoreAnalysisObservation
                    key={finding.id}
                    storageKey={`escribiendo:analysis-ignore:${userId}:${bookId}:repetition:${finding.id}:${finding.first.contentVersion}:${finding.second.contentVersion}`}
                    title={finding.message}
                  >
                    <p className="font-medium text-ink">{finding.message}</p>
                    <blockquote className="mt-2 border-l-2 border-accent/60 pl-3 font-serif text-sm italic text-ink-soft">
                      «{finding.matchedText}»
                    </blockquote>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      {finding.explanation}
                    </p>
                    <p className="mt-3 text-xs text-ink-muted">
                      {finding.scope === "chapter" ? "Dentro del capítulo" : "Entre capítulos"} ·{" "}
                      {finding.algorithm} · Similitud {number(finding.score * 100, 0)}%
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <TargetLink
                        bookId={bookId}
                        target={finding.first}
                        label="Primera aparición"
                      />
                      <TargetLink
                        bookId={bookId}
                        target={finding.second}
                        label="Segunda aparición"
                      />
                    </div>
                  </IgnoreAnalysisObservation>
                ))}
              </ol>
            ) : (
              <p className="mt-4 rounded-lg bg-ink/5 p-4 text-sm text-ink-soft">
                No se encontraron coincidencias sobre los umbrales actuales.
              </p>
            )}
            {repetitionTruncated || totalRepetitionFindings > visibleRepetitionFindings.length ? (
              <p className="mt-3 text-xs text-ink-muted">
                El resultado se limitó para mantener acotado el análisis; revisa también los
                capítulos manualmente.
              </p>
            ) : null}
          </section>

          <section
            id="legibilidad"
            className="panel scroll-mt-24 p-5 sm:p-6"
            aria-labelledby="readability-heading"
          >
            <p className="meta-label">Indicadores orientativos para español</p>
            <h2 id="readability-heading" className="mt-1 font-serif text-2xl text-ink">
              Legibilidad
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Las fórmulas estiman rasgos estructurales (sílabas, palabras y oraciones), no
              comprensión, estilo ni calidad literaria. La cuenta silábica es una aproximación
              automática.
            </p>
            {readability.length ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Indicadores de legibilidad por sección narrativa
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Sección
                      </th>
                      <th scope="col" className="py-2 px-2 font-medium">
                        Palabras
                      </th>
                      <th scope="col" className="py-2 px-2 font-medium">
                        Oraciones
                      </th>
                      <th scope="col" className="py-2 px-2 font-medium">
                        Sílabas
                      </th>
                      <th scope="col" className="py-2 px-2 font-medium">
                        Pal./oración
                      </th>
                      <th scope="col" className="py-2 px-2 font-medium">
                        Letras/pal.
                      </th>
                      <th scope="col" className="py-2 px-2 font-medium">
                        FH*
                      </th>
                      <th scope="col" className="py-2 pl-2 font-medium">
                        Szigriszt*
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {readability.map((item) => (
                      <tr key={item.sectionId} className="border-b border-line/70 align-top">
                        <th scope="row" className="py-3 pr-3 font-medium text-ink">
                          {item.sectionTitle}
                        </th>
                        <td className="py-3 px-2 tabular-nums text-ink-soft">
                          {number(item.wordCount)}
                        </td>
                        <td className="py-3 px-2 tabular-nums text-ink-soft">
                          {number(item.sentenceCount)}
                        </td>
                        <td className="py-3 px-2 tabular-nums text-ink-soft">
                          {number(item.syllableCount)}
                        </td>
                        <td className="py-3 px-2 tabular-nums text-ink-soft">
                          {item.meanWordsPerSentence === null
                            ? "—"
                            : number(item.meanWordsPerSentence, 1)}
                        </td>
                        <td className="py-3 px-2 tabular-nums text-ink-soft">
                          {item.meanCharactersPerWord === null
                            ? "—"
                            : number(item.meanCharactersPerWord, 1)}
                        </td>
                        <td className="py-3 px-2 tabular-nums text-ink-soft">
                          {item.fernandezHuerta === null ? "—" : number(item.fernandezHuerta, 1)}
                        </td>
                        <td className="py-3 pl-2 tabular-nums text-ink-soft">
                          {item.szigrisztPazos === null ? "—" : number(item.szigrisztPazos, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {readability.some((item) => item.shortSample) ? (
                  <p className="mt-3 text-xs text-ink-muted">
                    * Las muestras cortas pueden dar valores inestables; interprétalos con cautela.
                  </p>
                ) : null}
                <details className="mt-4 rounded-lg bg-ink/5 p-4 text-xs leading-relaxed text-ink-muted">
                  <summary className="cursor-pointer font-medium text-ink-soft">
                    Cómo leer las fórmulas
                  </summary>
                  <p className="mt-2">
                    Fernández-Huerta (FH) y Szigriszt-Pazos no son calificaciones. FH tiene una
                    ambigüedad publicada sobre la normalización del componente de oraciones; el
                    método aplicado se especifica en la documentación técnica. Las puntuaciones
                    pueden variar según la fórmula y el tamaño de muestra.
                  </p>
                </details>
                <details className="mt-3 rounded-lg bg-ink/5 p-4 text-xs leading-relaxed text-ink-muted">
                  <summary className="cursor-pointer font-medium text-ink-soft">
                    Distribución de longitud de párrafos
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {readability.map((item) => (
                      <div key={item.sectionId}>
                        <h3 className="font-medium text-ink-soft">{item.sectionTitle}</h3>
                        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                          {Object.entries(item.paragraphDistribution).map(([range, count]) => (
                            <li key={range} className="flex justify-between gap-2">
                              <span>{range}</span>
                              <span className="tabular-nums">{number(count)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-ink/5 p-4 text-sm text-ink-soft">
                No hay suficiente texto narrativo para calcular estos indicadores.
              </p>
            )}
          </section>

          <section
            id="ritmo"
            className="panel scroll-mt-24 p-5 sm:p-6"
            aria-labelledby="rhythm-heading"
          >
            <p className="meta-label">Comparación formal entre capítulos</p>
            <h2 id="rhythm-heading" className="mt-1 font-serif text-2xl text-ink">
              Ritmo narrativo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{rhythmNote}</p>
            {rhythm.length ? (
              <div className="mt-5 space-y-6">
                <div>
                  <h3 className="meta-label">Palabras por capítulo</h3>
                  <ol className="mt-3 space-y-3" aria-label="Gráfico de palabras por capítulo">
                    {rhythm.map((chapter) => (
                      <BarRow
                        key={chapter.sectionId}
                        label={chapter.sectionTitle}
                        value={chapter.wordCount}
                        max={maxWords}
                        valueLabel={number(chapter.wordCount)}
                      />
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="meta-label">Proporción de diálogo detectado</h3>
                  <p className="mt-1 text-xs text-ink-muted">
                    Estimación por párrafos marcados con raya de diálogo; no clasifica el contenido
                    por significado.
                  </p>
                  <ol
                    className="mt-3 space-y-3"
                    aria-label="Gráfico de proporción de diálogo por capítulo"
                  >
                    {rhythm.map((chapter) => (
                      <BarRow
                        key={chapter.sectionId}
                        label={chapter.sectionTitle}
                        value={chapter.dialogueWordPercentage ?? 0}
                        max={100}
                        valueLabel={
                          chapter.dialogueWordPercentage === null
                            ? "—"
                            : `${number(chapter.dialogueWordPercentage, 1)}%`
                        }
                      />
                    ))}
                  </ol>
                </div>
                <section aria-label="Variación de extensión entre capítulos">
                  <h3 className="meta-label">Variación de extensión entre capítulos</h3>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-ink/5 p-4">
                      <dt className="text-xs text-ink-muted">Media de palabras</dt>
                      <dd className="mt-1 font-serif text-xl text-ink">
                        {number(chapterLengthVariation.meanWords, 1)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-ink/5 p-4">
                      <dt className="text-xs text-ink-muted">Desviación estándar poblacional</dt>
                      <dd className="mt-1 font-serif text-xl text-ink">
                        {number(chapterLengthVariation.standardDeviationWords, 1)} palabras
                      </dd>
                    </div>
                    <div className="rounded-lg bg-ink/5 p-4">
                      <dt className="text-xs text-ink-muted">Variación relativa</dt>
                      <dd className="mt-1 font-serif text-xl text-ink">
                        {chapterLengthVariation.coefficientOfVariation === null
                          ? "—"
                          : `${number(chapterLengthVariation.coefficientOfVariation * 100, 1)}%`}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-ink-muted">
                    Basado en {number(chapterLengthVariation.sectionCount)} capítulos o unidades
                    narrativas; describe diferencias de extensión, no tensión narrativa.
                  </p>
                </section>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Métricas de párrafo y diálogo por capítulo
                    </caption>
                    <thead>
                      <tr className="border-b border-line text-xs text-ink-muted">
                        <th scope="col" className="py-2 pr-3 font-medium">
                          Sección
                        </th>
                        <th scope="col" className="py-2 px-2 font-medium">
                          Párrafos
                        </th>
                        <th scope="col" className="py-2 px-2 font-medium">
                          Oraciones/párrafo
                        </th>
                        <th scope="col" className="py-2 px-2 font-medium">
                          Pal./párrafo
                        </th>
                        <th scope="col" className="py-2 px-2 font-medium">
                          Diálogo
                        </th>
                        <th scope="col" className="py-2 pl-2 font-medium">
                          No diálogo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rhythm.map((chapter) => (
                        <tr key={chapter.sectionId} className="border-b border-line/70">
                          <th scope="row" className="py-3 pr-3 font-medium text-ink">
                            {chapter.sectionTitle}
                          </th>
                          <td className="py-3 px-2 tabular-nums text-ink-soft">
                            {number(chapter.paragraphCount)}
                          </td>
                          <td className="py-3 px-2 tabular-nums text-ink-soft">
                            {chapter.paragraphCount > 0
                              ? number(chapter.sentenceCount / chapter.paragraphCount, 1)
                              : "—"}
                          </td>
                          <td className="py-3 px-2 tabular-nums text-ink-soft">
                            {chapter.meanParagraphWords === null
                              ? "—"
                              : number(chapter.meanParagraphWords, 1)}
                          </td>
                          <td className="py-3 px-2 tabular-nums text-ink-soft">
                            {chapter.dialogueWordPercentage === null
                              ? "—"
                              : `${number(chapter.dialogueWordPercentage, 1)}%`}
                          </td>
                          <td className="py-3 pl-2 tabular-nums text-ink-soft">
                            {chapter.nonDialogueNarrationWordPercentage === null
                              ? "—"
                              : `${number(chapter.nonDialogueNarrationWordPercentage, 1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="rounded-lg bg-ink/5 p-4 text-xs leading-relaxed text-ink-muted">
                  <summary className="cursor-pointer font-medium text-ink-soft">
                    Distribución de extensión de párrafos por capítulo
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[34rem] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-line">
                          <th scope="col" className="py-2 pr-3 font-medium">
                            Capítulo
                          </th>
                          {rhythm[0]?.paragraphLengthDistribution.map((bucket) => (
                            <th key={bucket.label} scope="col" className="py-2 px-2 font-medium">
                              {bucket.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rhythm.map((chapter) => (
                          <tr key={chapter.sectionId} className="border-b border-line/70">
                            <th scope="row" className="py-2 pr-3 font-medium text-ink-soft">
                              {chapter.sectionTitle}
                            </th>
                            {chapter.paragraphLengthDistribution.map((bucket) => (
                              <td key={bucket.label} className="py-2 px-2 tabular-nums text-center">
                                {number(bucket.paragraphCount)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-ink/5 p-4 text-sm text-ink-soft">
                No hay capítulos narrativos con contenido suficiente para comparar.
              </p>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
