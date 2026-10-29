import type { PdfRun } from "@escribiendo/export-engine";

/** Une solo texto contiguo con idéntico estado de dibujo, sin cambiar su posición. */
export function appendPdfRun(runs: PdfRun[], run: PdfRun): void {
  const previous = runs.at(-1);
  if (
    previous &&
    previous.widthMm !== undefined &&
    run.widthMm !== undefined &&
    !previous.underline &&
    !run.underline &&
    !previous.strike &&
    !run.strike &&
    previous.font === run.font &&
    (previous.family ?? "serif") === (run.family ?? "serif") &&
    previous.sizePt === run.sizePt &&
    previous.baselineMm === run.baselineMm &&
    (previous.wordSpacing ?? 0) === (run.wordSpacing ?? 0) &&
    (previous.letterSpacingPt ?? 0) === (run.letterSpacingPt ?? 0) &&
    (previous.risePt ?? 0) === (run.risePt ?? 0) &&
    Math.abs(previous.xMm + previous.widthMm - run.xMm) < 1e-9
  ) {
    previous.text += run.text;
    previous.widthMm += run.widthMm;
    return;
  }
  // El buffer es propio: no se modifica un tramo que pertenezca al llamador.
  runs.push({ ...run });
}
