import type { LayoutDiagnostic } from "@escribiendo/editorial-engine";

/**
 * Diagnóstico de la composición.
 *
 * Recoge los problemas que la edición necesita ver antes de imprimir:
 * viudas, huérfanas, desbordes y palabras que no caben en la caja de texto.
 */

const TITULOS: Record<LayoutDiagnostic["code"], string> = {
  WIDOW: "Viuda",
  ORPHAN: "Huérfana",
  OVERFLOW: "Desborde",
  LINE_TOO_LONG: "Línea demasiado larga",
  LONG_WORD: "Palabra más ancha que la caja",
  EMPTY_PAGE: "Página en blanco",
  CHAPTER_NOT_ON_RECTO: "Capítulo en página par",
  FOOTNOTE_OVERFLOW: "Nota al pie sin espacio",
  TOC_NOT_CONVERGED: "Índice inestable",
  TOC_FOLIO_MISMATCH: "Folio del índice descuadrado",
  MATTER_LOGO_OMITIDO: "Logotipo de materia omitido",
  LEGAL_PAGE_INVALID: "Página legal incompleta",
};

interface DiagnosticsPanelProps {
  diagnostics: LayoutDiagnostic[];
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        No hay problemas de composición detectados. La maqueta encaja con el manuscrito.
      </p>
    );
  }

  const errores = diagnostics.filter((diagnostico) => diagnostico.severity === "error");
  const avisos = diagnostics.filter((diagnostico) => diagnostico.severity === "warning");
  const infos = diagnostics.filter((diagnostico) => diagnostico.severity === "info");

  return (
    <div className="space-y-6">
      {errores.length > 0 ? (
        <section aria-label="errores de composición">
          <h3 className="font-serif text-lg text-ink">Errores ({errores.length})</h3>
          <ul className="mt-3 space-y-2">
            {errores.map((diagnostico) => (
              <DiagnosticRow
                key={`${diagnostico.code}-${diagnostico.blockId ?? ""}-${diagnostico.page ?? ""}`}
                diagnostic={diagnostico}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {avisos.length > 0 ? (
        <section aria-label="avisos de composición">
          <h3 className="font-serif text-lg text-ink">Avisos ({avisos.length})</h3>
          <ul className="mt-3 space-y-2">
            {avisos.map((diagnostico) => (
              <DiagnosticRow
                key={`${diagnostico.code}-${diagnostico.blockId ?? ""}-${diagnostico.page ?? ""}`}
                diagnostic={diagnostico}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {infos.length > 0 ? (
        <section aria-label="notas de composición">
          <h3 className="font-serif text-lg text-ink">Notas ({infos.length})</h3>
          <ul className="mt-3 space-y-2">
            {infos.map((diagnostico) => (
              <DiagnosticRow
                key={`${diagnostico.code}-${diagnostico.blockId ?? ""}-${diagnostico.page ?? ""}`}
                diagnostic={diagnostico}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: LayoutDiagnostic }) {
  const tono =
    diagnostic.severity === "error"
      ? "border-danger/40 bg-danger/5"
      : diagnostic.severity === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-ink/15 bg-ink/[0.02]";

  return (
    <li className={`rounded-sm border px-4 py-3 ${tono}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-ink">{TITULOS[diagnostic.code] ?? diagnostic.code}</span>
        {diagnostic.page ? (
          <span className="text-xs text-ink-muted">página {diagnostic.page}</span>
        ) : null}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{diagnostic.message}</p>
    </li>
  );
}
