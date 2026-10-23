import { describe, expect, it } from "vitest";
import { coverPlacement } from "./cover-placement";

const PAGE_WIDTH = 148;
const PAGE_HEIGHT = 210;

describe("geometría de la portada", () => {
  it("cubre la hoja sin deformar una imagen apaisada", () => {
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1600, 1000);

    expect(placement.widthMm).toBeCloseTo(336, 6);
    expect(placement.heightMm).toBeCloseTo(210, 6);
    expect(placement.xMm).toBeCloseTo(-94, 6);
    expect(placement.topMm).toBeCloseTo(0, 6);
  });

  it("cubre la hoja sin deformar una imagen vertical", () => {
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1000, 1600);

    expect(placement.widthMm).toBeCloseTo(148, 6);
    expect(placement.heightMm).toBeCloseTo(236.8, 6);
    expect(placement.xMm).toBeCloseTo(0, 6);
    expect(placement.topMm).toBeCloseTo(-13.4, 6);
  });

  it("no recorta una imagen con la misma proporción que la página", () => {
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1480, 2100);

    expect(placement).toEqual({ xMm: 0, topMm: 0, widthMm: 148, heightMm: 210 });
  });

  it("respeta el punto focal elegido por el autor", () => {
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1600, 1000, {
      x: 0,
      y: 100,
      zoom: 1,
    });

    expect(placement.xMm).toBeCloseTo(0, 6);
    expect(placement.topMm).toBeCloseTo(0, 6);

    const opuesto = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1600, 1000, {
      x: 100,
      y: 0,
      zoom: 1,
    });

    expect(opuesto.xMm).toBeCloseTo(PAGE_WIDTH - placement.widthMm, 6);
  });

  it("mantiene el punto focal en su sitio al ampliar", () => {
    const crop = { x: 30, y: 70, zoom: 1.8 };
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1600, 1000, crop);

    expect(placement.xMm + (crop.x / 100) * placement.widthMm).toBeCloseTo(
      (crop.x / 100) * PAGE_WIDTH,
      6,
    );
    expect(placement.topMm + (crop.y / 100) * placement.heightMm).toBeCloseTo(
      (crop.y / 100) * PAGE_HEIGHT,
      6,
    );
  });

  it("acota el punto focal y el zoom a su rango", () => {
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1600, 1000, {
      x: -20,
      y: 140,
      zoom: 9,
    });
    const referencia = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 1600, 1000, {
      x: 0,
      y: 100,
      zoom: 3,
    });

    expect(placement).toEqual(referencia);
  });

  it("no produce valores no finitos con una imagen sin dimensiones", () => {
    const placement = coverPlacement(PAGE_WIDTH, PAGE_HEIGHT, 0, 0);

    for (const value of Object.values(placement)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
