import { describe, expect, it } from "vitest";
import {
  clampCropRect,
  computeFocalCrop,
  cropToFocalState,
  cropToPercentages,
  isValidCropRect,
  largestCropForAspect,
} from "./geometry";

describe("computeFocalCrop", () => {
  it("recorta al centro manteniendo la proporción 1:1,6", () => {
    const result = computeFocalCrop({
      image: { width: 2000, height: 3000 },
      zoom: 1,
      focusX: 0.5,
      focusY: 0.5,
    });

    expect(result.crop).toEqual({ x: 63, y: 0, width: 1875, height: 3000 });
    expect(result.crop.width / result.crop.height).toBeCloseTo(0.625, 2);
  });

  it("acerca la imagen y respeta el punto focal", () => {
    const result = computeFocalCrop({
      image: { width: 1600, height: 2560 },
      zoom: 2,
      focusX: 0.25,
      focusY: 0.7,
    });

    expect(result.crop.width).toBe(800);
    expect(result.crop.height).toBe(1280);
    expect(result.crop.x).toBe(0);
    expect(result.crop.y).toBe(1152);
  });

  it("usa toda la anchura cuando la imagen es más estrecha que la proporción", () => {
    const base = largestCropForAspect({ width: 1200, height: 2400 });
    expect(base.width).toBe(1200);
    expect(base.height).toBe(1920);
  });

  it("no permite que el recorte se salga de la imagen", () => {
    const result = computeFocalCrop({
      image: { width: 1000, height: 1800 },
      zoom: 3,
      focusX: 1,
      focusY: 1,
    });

    expect(isValidCropRect(result.crop, { width: 1000, height: 1800 })).toBe(true);
    expect(result.crop.x + result.crop.width).toBeLessThanOrEqual(1000);
    expect(result.crop.y + result.crop.height).toBeLessThanOrEqual(1800);
  });
});

describe("utilidades de recorte", () => {
  it("reconstruye zoom y foco desde un recorte guardado", () => {
    const image = { width: 1600, height: 2560 };
    const computed = computeFocalCrop({ image, zoom: 1.5, focusX: 0.3, focusY: 0.6 });
    const state = cropToFocalState(computed.crop, image);

    expect(state.zoom).toBeCloseTo(1.5, 1);
    expect(state.focusX).toBeCloseTo(0.3, 1);
    expect(state.focusY).toBeCloseTo(0.6, 1);
  });

  it("limita un recorte inválido a los bordes", () => {
    const crop = clampCropRect(
      { x: -20, y: 900, width: 500, height: 500 },
      { width: 1000, height: 1200 },
    );

    expect(crop).toEqual({ x: 0, y: 700, width: 500, height: 500 });
  });

  it("calcula porcentajes para la previsualización", () => {
    const percentages = cropToPercentages(
      { x: 100, y: 200, width: 400, height: 640 },
      { width: 1000, height: 1280 },
    );

    expect(percentages).toEqual({ left: 10, top: 15.625, width: 40, height: 50 });
  });
});
