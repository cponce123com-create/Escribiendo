import { expect, it } from "vitest";
import type { PdfRun } from "@escribiendo/export-engine";
import { appendPdfRun } from "./pdf-runs";

const base: PdfRun = {
  text: "Una",
  font: "regular",
  family: "serif",
  sizePt: 11,
  xMm: 18,
  baselineMm: 20,
  widthMm: 6,
  wordSpacing: 2,
};

it("agrupa palabras y espacios conservando inicio, avance y justificación sin mutar la entrada", () => {
  const result: PdfRun[] = [];
  appendPdfRun(result, base);
  appendPdfRun(result, { ...base, text: " ", xMm: 24, widthMm: 2 });
  appendPdfRun(result, { ...base, text: "frase", xMm: 26, widthMm: 9 });
  expect(result).toEqual([{ ...base, text: "Una frase", widthMm: 17 }]);
  expect(base.text).toBe("Una");
  expect(result[0]!.xMm + result[0]!.widthMm!).toBe(35);
});

it.each<Partial<PdfRun>>([
  { font: "bold" },
  { font: "italic" },
  { family: "monospace" },
  { sizePt: 9 },
  { baselineMm: 25 },
  { risePt: 4 },
  { wordSpacing: 3 },
  { letterSpacingPt: 1 },
  { underline: true },
  { strike: true },
  { xMm: 25 },
  { widthMm: undefined },
])("conserva límites de estilo, llamadas de nota, renglón y desplazamiento: %j", (change) => {
  const result: PdfRun[] = [];
  appendPdfRun(result, base);
  appendPdfRun(result, { ...base, text: "nota", xMm: 24, ...change });
  expect(result).toHaveLength(2);
});

it("no combina decoración ni modifica la geometría de sus trazos", () => {
  const result: PdfRun[] = [];
  appendPdfRun(result, { ...base, underline: true });
  appendPdfRun(result, { ...base, text: "otra", xMm: 24, underline: true });
  expect(result).toHaveLength(2);
});
