import { describe, expect, it } from "vitest";
import {
  DIGITAL_COVER,
  SIX_BY_NINE_REFERENCE,
  computePrintCoverLayout,
  mmToPixels,
} from "./print-layout";

describe("computePrintCoverLayout", () => {
  it("calcula la portada frontal de 6 × 9 a 300 ppp sin sangrado", () => {
    const layout = computePrintCoverLayout({
      trimWidthMm: 152.4,
      trimHeightMm: 228.6,
      pageCount: 300,
      paperCaliperMm: 0.1,
      bleedMm: 0,
      safetyMm: 5,
      dpi: 300,
      withBleed: false,
    });

    expect(layout.pixels.frontWidth).toBe(1800);
    expect(layout.pixels.frontHeight).toBe(2700);
    expect(layout.sheets).toBe(150);
    expect(layout.spineWidthMm).toBe(15);
    expect(layout.totalWidthMm).toBe(319.8);
    expect(layout.totalHeightMm).toBe(228.6);
    expect(layout.pixels.spineWidth).toBe(177);
  });

  it("añade el sangrado a los cuatro bordes y calcula el área segura", () => {
    const layout = computePrintCoverLayout({
      trimWidthMm: 152.4,
      trimHeightMm: 228.6,
      pageCount: 300,
      paperCaliperMm: 0.1,
      bleedMm: 3,
      safetyMm: 5,
      dpi: 300,
      withBleed: true,
    });

    expect(layout.totalWidthMm).toBeCloseTo(325.8, 3);
    expect(layout.totalHeightMm).toBeCloseTo(234.6, 3);
    expect(layout.pixels.totalWidth).toBe(3848);
    expect(layout.pixels.totalHeight).toBe(2771);
    expect(layout.safeArea.frontWidthMm).toBe(142.4);
    expect(layout.safeArea.frontHeightMm).toBe(218.6);
    expect(layout.warnings).toHaveLength(0);
  });

  it("redondea las páginas impares a una hoja completa", () => {
    const layout = computePrintCoverLayout({
      trimWidthMm: 152.4,
      trimHeightMm: 228.6,
      pageCount: 301,
      paperCaliperMm: 0.1,
      bleedMm: 3,
      safetyMm: 5,
      dpi: 300,
      withBleed: true,
    });

    expect(layout.sheets).toBe(151);
    expect(layout.spineWidthMm).toBeCloseTo(15.1, 3);
    expect(layout.warnings.join(" ")).toContain("impar");
  });

  it("no usa un lomo fijo: responde al grosor real del papel", () => {
    const common = {
      trimWidthMm: 152.4,
      trimHeightMm: 228.6,
      pageCount: 320,
      bleedMm: 3,
      safetyMm: 5,
      dpi: 300,
      withBleed: true,
    };

    const offset = computePrintCoverLayout({ ...common, paperCaliperMm: 0.1 });
    const bulky = computePrintCoverLayout({ ...common, paperCaliperMm: 0.16 });

    expect(bulky.spineWidthMm).toBeGreaterThan(offset.spineWidthMm);
    expect(bulky.spineWidthMm).toBeCloseTo(25.6, 3);
    expect(offset.spineWidthMm).toBeCloseTo(16, 3);
  });

  it("avisa del lomo estrecho y de la falta de sangrado", () => {
    const layout = computePrintCoverLayout({
      trimWidthMm: 148,
      trimHeightMm: 210,
      pageCount: 24,
      paperCaliperMm: 0.05,
      bleedMm: 3,
      safetyMm: 5,
      dpi: 300,
      withBleed: false,
    });

    expect(layout.spineWidthMm).toBeCloseTo(0.6, 5);
    expect(layout.warnings.join(" ")).toContain("lomo");
    expect(layout.warnings.join(" ")).toContain("sangrado");
  });
});

describe("referencias de resolución", () => {
  it("convierte 6 × 9 pulgadas a 1800 × 2700 px a 300 ppp", () => {
    expect(mmToPixels(SIX_BY_NINE_REFERENCE.widthMm, 300)).toBe(SIX_BY_NINE_REFERENCE.widthPx);
    expect(mmToPixels(SIX_BY_NINE_REFERENCE.heightMm, 300)).toBe(SIX_BY_NINE_REFERENCE.heightPx);
  });

  it("mantiene la referencia digital 1:1,6", () => {
    expect(DIGITAL_COVER.width / DIGITAL_COVER.height).toBeCloseTo(0.625, 5);
    expect(DIGITAL_COVER.highResolutionWidth).toBe(2560);
    expect(DIGITAL_COVER.highResolutionHeight).toBe(4096);
  });
});
