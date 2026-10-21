import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  getCloudinaryConfig: () => ({
    cloudName: "demo",
    apiKey: "key",
    apiSecret: "secret",
    uploadFolder: "escribiendo",
  }),
}));

import { isAllowedImageSource, loadExportImages } from "./images";

const ALLOWED = "https://res.cloudinary.com/demo/image/upload/v1/libro/plaza.jpg";

describe("isAllowedImageSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acepta una imagen de la cuenta configurada", () => {
    expect(isAllowedImageSource(ALLOWED)).toBe(true);
  });

  it("rechaza otros hosts, otros protocolos y otras cuentas", () => {
    expect(isAllowedImageSource("http://res.cloudinary.com/demo/image/upload/plaza.jpg")).toBe(
      false,
    );
    expect(isAllowedImageSource("https://ejemplo.test/plaza.jpg")).toBe(false);
    expect(
      isAllowedImageSource("https://res.cloudinary.com/otra-cuenta/image/upload/plaza.jpg"),
    ).toBe(false);
    expect(isAllowedImageSource("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageSource("")).toBe(false);
  });
});

describe("loadExportImages", () => {
  it("reutiliza las imágenes ya resueltas sin descargarlas", async () => {
    const asset = {
      data: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
      extension: "jpg" as const,
      width: 10,
      height: 10,
    };
    const result = await loadExportImages({
      sources: [ALLOWED],
      target: "pdf",
      provided: new Map([[ALLOWED, asset]]),
    });

    expect(result.assets.get(ALLOWED)).toBe(asset);
    expect(result.omitted).toEqual([]);
  });

  it("marca como omitida una URL que no pertenece a la cuenta", async () => {
    const result = await loadExportImages({
      sources: ["https://ejemplo.test/plaza.jpg"],
      target: "pdf",
    });

    expect(result.assets.size).toBe(0);
    expect(result.omitted).toEqual(["https://ejemplo.test/plaza.jpg"]);
  });
});
