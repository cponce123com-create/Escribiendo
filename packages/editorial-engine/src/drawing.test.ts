import { describe, expect, it } from "vitest";
import { baselineCorrectionPt, dropCapCorrectionPt, textLinePlacement } from "./drawing";
import type { LaidOutBlock } from "./pagination";

const block: LaidOutBlock = {
  id: "p1",
  kind: "body",
  style: {
    fontFamily: "serif",
    fontSizePt: 10,
    lineHeight: 1.5,
    spaceBeforePt: 0,
    spaceAfterPt: 0,
    alignment: "left",
    firstLineIndentMm: 4,
    letterSpacingPt: 0,
    uppercase: false,
    smallCaps: false,
    hyphenation: false,
    keepWithNext: false,
  },
  lines: [
    { text: "uno dos", hyphenated: false, overflow: false },
    { text: "tres", hyphenated: false, overflow: false },
  ],
  spaceBeforeMm: 0,
  spaceAfterMm: 0,
  firstLineIndentMm: 4,
};

describe("geometría de dibujo", () => {
  it("descuenta la sangría del primer renglón, pero no de la continuación", () => {
    const first = textLinePlacement(block, 0, 80, 10);
    const next = textLinePlacement(block, 1, 80, 10);

    expect(first.xMm).toBe(14);
    expect(first.widthMm).toBe(76);
    expect(next.xMm).toBe(10);
    expect(next.widthMm).toBe(80);
  });

  it("calcula la compensación de línea base con las métricas de Liberation", () => {
    expect(baselineCorrectionPt("serif", 10, 15)).toBeCloseTo(1.125);
    expect(baselineCorrectionPt("sans-serif", 10, 15)).toBeCloseTo(1.035);
    expect(baselineCorrectionPt("monospace", 10, 15)).toBeCloseTo(1.835);
  });
});

describe("inicial capitular", () => {
  it("baja la inicial para que ocupe las tres primeras líneas", () => {
    const lineHeight = 13.2;
    const correction = dropCapCorrectionPt("serif", 11, lineHeight);

    expect(correction).toBeGreaterThan(0);
    expect(correction).toBeLessThan(lineHeight * 3);
  });

  it("coloca la línea base de la inicial donde la coloca el PDF", () => {
    const family = "serif" as const;
    const fontSize = 11;
    const lineHeight = 13.2;
    const capitalSize = fontSize * 3;
    const expected =
      baselineCorrectionPt(family, capitalSize, lineHeight) + (capitalSize - fontSize) * 0.891;

    expect(dropCapCorrectionPt(family, fontSize, lineHeight)).toBeCloseTo(expected, 6);
  });

  it("depende de las métricas de cada familia", () => {
    expect(dropCapCorrectionPt("sans-serif", 11, 13.2)).not.toBeCloseTo(
      dropCapCorrectionPt("serif", 11, 13.2),
      6,
    );
  });

  it("sin inicial, la corrección de la línea base no cambia", () => {
    expect(baselineCorrectionPt("serif", 11, 13.2)).toBeLessThan(
      dropCapCorrectionPt("serif", 11, 13.2),
    );
  });
});
