import { describe, expect, it } from "vitest";
import { coverObjectPosition } from "./cover-shared";

describe("coverObjectPosition", () => {
  it("convierte el punto de recorte guardado a posición CSS", () => {
    expect(coverObjectPosition({ x: 42, y: 63, zoom: 1.4 })).toBe("42% 63%");
  });
});
