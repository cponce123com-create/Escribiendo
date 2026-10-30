import { expect, it } from "vitest";
import { parsePlanLabels, planProgress, planTone, planVisual } from "./presentation";
it("calcula progreso solo con capítulos terminados, sin inventar avance", () => {
  expect(planProgress([])).toEqual({ total: 0, done: 0, percent: 0 });
  expect(
    planProgress([
      { kind: "ACT", status: "DONE" },
      { kind: "SCENE", status: "DONE" },
      { kind: "CHAPTER", status: "DONE" },
      { kind: "CHAPTER", status: "WRITING" },
    ]),
  ).toEqual({ total: 2, done: 1, percent: 50 });
});
it("normaliza etiquetas explícitas sin inferir temas de la historia", () => {
  expect(parsePlanLabels(" Duelo, Inicio\nDUeLo, Memoria ")).toEqual([
    "Duelo",
    "Inicio",
    "Memoria",
  ]);
  expect(parsePlanLabels("")).toEqual([]);
  expect(() => parsePlanLabels("x".repeat(25))).toThrow();
  expect(() => parsePlanLabels("a\u0000b")).toThrow();
  expect(() =>
    parsePlanLabels(Array.from({ length: 9 }, (_, i) => `tema${i}`).join(",")),
  ).toThrow();
});
it("tolera filas antiguas, paleta cíclica y datos visuales no válidos", () => {
  expect(planVisual(null).labels).toEqual([]);
  expect(planVisual({ imageAssetId: "ajeno-no-uuid" }).imageAssetId).toBeNull();
  expect(planTone({}, 5)).toBe("blue");
  expect(planTone({ tone: "rose" }, 0)).toBe("rose");
});
