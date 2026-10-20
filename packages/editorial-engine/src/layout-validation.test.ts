import { describe, expect, it } from "vitest";
import { PAGE_FORMAT_PRESETS, inchesToMm, mmToPoints } from "./page-formats";
import { validateLayoutGeometry } from "./layout-validation";

describe("page formats", () => {
  it("define A5 con las dimensiones correctas", () => {
    expect(PAGE_FORMAT_PRESETS.A5.widthMm).toBe(148);
    expect(PAGE_FORMAT_PRESETS.A5.heightMm).toBe(210);
  });

  it("convierte pulgadas a milímetros", () => {
    expect(inchesToMm(1)).toBe(25.4);
  });

  it("convierte milímetros a puntos PostScript", () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72, 5);
  });
});

describe("validateLayoutGeometry", () => {
  it("acepta una maqueta A5 razonable", () => {
    const result = validateLayoutGeometry({
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 20,
      marginBottomMm: 22,
      marginInnerMm: 18,
      marginOuterMm: 16,
      gutterMm: 0,
      bleedMm: 0,
      headerDistanceMm: 10,
      footerDistanceMm: 12,
    });

    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("rechaza márgenes que anulan el área de texto", () => {
    const result = validateLayoutGeometry({
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 110,
      marginBottomMm: 110,
      marginInnerMm: 20,
      marginOuterMm: 20,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "TEXT_BLOCK_HEIGHT_INVALID")).toBe(true);
  });

  it("advierte sobre un margen interior demasiado ajustado", () => {
    const result = validateLayoutGeometry({
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 20,
      marginBottomMm: 20,
      marginInnerMm: 5,
      marginOuterMm: 16,
    });

    expect(result.issues.some((issue) => issue.code === "INNER_MARGIN_TIGHT")).toBe(true);
  });
});
