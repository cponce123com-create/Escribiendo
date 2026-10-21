import { describe, expect, it } from "vitest";
import { computeImageLayout } from "./image";

const BASE = {
  textWidthMm: 100,
  textHeightMm: 150,
  captionFontFamily: "serif" as const,
  captionFontSizePt: 9,
};

describe("computeImageLayout", () => {
  it("respeta la proporción natural de la imagen", () => {
    const layout = computeImageLayout({ widthPx: 1200, heightPx: 800, widthPercent: 100 }, BASE);

    expect(layout.widthMm).toBeCloseTo(100, 5);
    expect(layout.heightMm).toBeCloseTo(66.67, 1);
    expect(layout.captionLines).toEqual([]);
    expect(layout.totalHeightMm).toBeCloseTo(layout.heightMm, 5);
  });

  it("reduce el ancho según el porcentaje elegido", () => {
    const layout = computeImageLayout({ widthPx: 1200, heightPx: 800, widthPercent: 50 }, BASE);

    expect(layout.widthMm).toBeCloseTo(50, 5);
    expect(layout.heightMm).toBeCloseTo(33.33, 1);
  });

  it("reserva altura para las líneas del pie", () => {
    const layout = computeImageLayout(
      {
        widthPx: 1200,
        heightPx: 800,
        widthPercent: 50,
        caption:
          "Una plaza pequeña al anochecer, con las farolas encendidas y el suelo mojado por la lluvia.",
      },
      BASE,
    );

    expect(layout.captionLines.length).toBeGreaterThan(0);
    expect(layout.totalHeightMm).toBeGreaterThan(layout.heightMm);
  });

  it("encoge una imagen vertical que no cabe en el área de texto", () => {
    const layout = computeImageLayout(
      { widthPx: 600, heightPx: 2400, widthPercent: 100 },
      { ...BASE, textHeightMm: 80 },
    );

    expect(layout.heightMm).toBeLessThanOrEqual(80);
    expect(layout.widthMm).toBeLessThan(100);
  });

  it("usa una caja prudente cuando no hay dimensiones", () => {
    const layout = computeImageLayout(undefined, BASE);

    expect(layout.widthMm).toBe(100);
    expect(layout.heightMm).toBeGreaterThan(0);
    expect(layout.totalHeightMm).toBeGreaterThan(0);
  });
});
