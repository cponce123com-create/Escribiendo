import { describe, expect, it } from "vitest";
import { diffWords, summarizeDiff } from "./diff";

describe("diffWords", () => {
  it("devuelve un único segmento cuando el texto no cambia", () => {
    expect(diffWords("hola mundo", "hola mundo")).toEqual([{ type: "equal", text: "hola mundo" }]);
  });

  it("no devuelve nada cuando ambos textos están vacíos", () => {
    expect(diffWords("", "")).toEqual([]);
  });

  it("detecta una palabra añadida", () => {
    const segments = diffWords("el gato duerme", "el gato duerme hoy");

    expect(segments).toContainEqual({ type: "insert", text: " hoy" });
    expect(summarizeDiff(segments).added).toBe(1);
  });

  it("detecta una palabra eliminada", () => {
    const segments = diffWords("el gato duerme hoy", "el gato duerme");

    expect(segments.some((segment) => segment.type === "delete")).toBe(true);
    expect(summarizeDiff(segments).removed).toBe(1);
  });

  it("reconstruye el texto original a partir de los segmentos", () => {
    const before = "la capa de la noche era silenciosa";
    const after = "la capa de la mañana era ruidosa";

    const segments = diffWords(before, after);
    const reconstructed = segments
      .filter((segment) => segment.type !== "insert")
      .map((segment) => segment.text)
      .join("");

    expect(reconstructed).toBe(before);
  });

  it("reconstruye el texto nuevo a partir de los segmentos", () => {
    const before = "la capa de la noche era silenciosa";
    const after = "la capa de la mañana era ruidosa";

    const segments = diffWords(before, after);
    const reconstructed = segments
      .filter((segment) => segment.type !== "delete")
      .map((segment) => segment.text)
      .join("");

    expect(reconstructed).toBe(after);
  });

  it("fusiona los segmentos contiguos del mismo tipo", () => {
    const segments = diffWords("uno dos tres", "uno dos tres");

    expect(segments).toHaveLength(1);
  });

  it("sustituye el texto completo cuando es demasiado largo", () => {
    const before = Array.from({ length: 5_000 }, (_, index) => `w${index}`).join(" ");
    const after = `${before} final`;

    const segments = diffWords(before, after);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.type).toBe("delete");
    expect(segments[1]?.type).toBe("insert");
  });
});

describe("summarizeDiff", () => {
  it("cuenta palabras añadidas, quitadas e intactas", () => {
    const segments = diffWords("una dos tres", "una tres cuatro");

    const summary = summarizeDiff(segments);

    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.unchanged).toBe(2);
  });
});
