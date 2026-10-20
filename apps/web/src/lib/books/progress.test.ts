import { describe, expect, it } from "vitest";
import { computeWritingProgress, remainingWords } from "./progress";

describe("computeWritingProgress", () => {
  it("devuelve cero sin objetivo declarado", () => {
    expect(computeWritingProgress(5_000, null)).toBe(0);
    expect(computeWritingProgress(0, null)).toBe(0);
  });

  it("calcula el porcentaje sobre el objetivo", () => {
    expect(computeWritingProgress(25_000, 100_000)).toBe(25);
    expect(computeWritingProgress(50_000, 100_000)).toBe(50);
    expect(computeWritingProgress(100_000, 100_000)).toBe(100);
  });

  it("redondea a dos decimales", () => {
    expect(computeWritingProgress(1, 3)).toBe(33.33);
    expect(computeWritingProgress(2, 3)).toBe(66.67);
  });

  it("nunca supera el 100, aunque se pase del objetivo", () => {
    expect(computeWritingProgress(200_000, 100_000)).toBe(100);
  });

  it("nunca es negativo", () => {
    expect(computeWritingProgress(0, 100_000)).toBe(0);
    expect(computeWritingProgress(-10, 100_000)).toBe(0);
  });

  it("ignora un objetivo inválido", () => {
    expect(computeWritingProgress(1_000, 0)).toBe(0);
    expect(computeWritingProgress(1_000, -5)).toBe(0);
  });
});

describe("remainingWords", () => {
  it("indica las palabras que faltan", () => {
    expect(remainingWords(30_000, 100_000)).toBe(70_000);
  });

  it("nunca es negativo", () => {
    expect(remainingWords(120_000, 100_000)).toBe(0);
  });

  it("devuelve null sin objetivo", () => {
    expect(remainingWords(1_000, null)).toBeNull();
  });
});
