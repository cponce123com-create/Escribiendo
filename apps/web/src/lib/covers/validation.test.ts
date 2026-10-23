import { describe, expect, it } from "vitest";
import { validateCoverImage } from "./validation";

const megabytes = (value: number) => value * 1024 * 1024;

describe("validateCoverImage · digital", () => {
  it("acepta como óptima una portada 1600 × 2560", () => {
    const result = validateCoverImage({
      width: 1600,
      height: 2560,
      format: "jpg",
      bytes: megabytes(2),
    });

    expect(result.quality).toBe("OPTIMAL");
    expect(result.issues).toHaveLength(0);
  });

  it("marca como aceptable una imagen por debajo de la recomendación", () => {
    const result = validateCoverImage({
      width: 1200,
      height: 1920,
      format: "webp",
      bytes: megabytes(1),
    });

    expect(result.quality).toBe("ACCEPTABLE");
    expect(result.issues.some((issue) => issue.code === "RESOLUTION")).toBe(true);
  });

  it("considera insuficiente una imagen que no se puede ampliar con honestidad", () => {
    const result = validateCoverImage({
      width: 900,
      height: 1440,
      format: "png",
      bytes: megabytes(1),
    });

    expect(result.quality).toBe("INSUFFICIENT");
    expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("reconoce la opción de alta resolución", () => {
    const result = validateCoverImage({
      width: 2560,
      height: 4096,
      format: "jpg",
      bytes: megabytes(4),
    });

    expect(result.quality).toBe("OPTIMAL");
    expect(result.issues.some((issue) => issue.code === "HIGH_RES")).toBe(true);
  });

  it("rechaza formatos no permitidos, imágenes horizontales y archivos excesivos", () => {
    const result = validateCoverImage({
      width: 3000,
      height: 2000,
      format: "gif",
      bytes: megabytes(12),
    });

    expect(result.quality).toBe("INSUFFICIENT");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["FORMAT", "BYTES", "ORIENTATION"]),
    );
  });

  it("avisa de la transparencia sin bloquear la portada", () => {
    const result = validateCoverImage({
      width: 1600,
      height: 2560,
      format: "png",
      bytes: megabytes(2),
      hasAlpha: true,
    });

    expect(result.quality).toBe("ACCEPTABLE");
    expect(result.issues.some((issue) => issue.code === "TRANSPARENCY")).toBe(true);
  });
});

describe("validateCoverImage · impresión", () => {
  it("acepta 1800 × 2700 para 6 × 9 a 300 ppp", () => {
    const result = validateCoverImage(
      { width: 1800, height: 2700, format: "jpg", bytes: megabytes(3) },
      { kind: "PRINT", widthMm: 152.4, heightMm: 228.6, dpi: 300, label: "6 × 9" },
    );

    expect(result.quality).toBe("OPTIMAL");
    expect(result.effectiveDpi).toBe(300);
    expect(result.requiredWidthPx).toBe(1800);
    expect(result.requiredHeightPx).toBe(2700);
  });

  it("avisa cuando la resolución efectiva es menor que 300 ppp", () => {
    const result = validateCoverImage(
      { width: 1200, height: 1800, format: "jpg", bytes: megabytes(2) },
      { kind: "PRINT", widthMm: 152.4, heightMm: 228.6, dpi: 300 },
    );

    expect(result.quality).toBe("ACCEPTABLE");
    expect(result.effectiveDpi).toBe(200);
    expect(result.issues.some((issue) => issue.code === "PRINT_RESOLUTION")).toBe(true);
  });

  it("rechaza una imagen de 150 ppp para impresión", () => {
    const result = validateCoverImage(
      { width: 900, height: 1350, format: "jpg", bytes: megabytes(1) },
      { kind: "PRINT", widthMm: 152.4, heightMm: 228.6, dpi: 300 },
    );

    expect(result.quality).toBe("INSUFFICIENT");
    expect(result.effectiveDpi).toBe(150);
  });
});
