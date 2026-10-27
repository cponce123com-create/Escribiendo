import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  getCloudinaryConfig: () => ({
    cloudName: "demo",
    apiKey: "key",
    apiSecret: "secret",
    uploadFolder: "escribiendo",
  }),
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { fetchImageBytes, isAllowedImageSource, loadExportImages } from "./images";

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

const src = "https://res.cloudinary.com/demo/image/upload/v1/foto.jpg";
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, "1"])(
  "aborta al superar el máximo aunque content-length sea %s",
  async (length) => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      },
      cancel,
    });
    const response = new Response(stream, { headers: length ? { "content-length": length } : {} });
    Object.defineProperty(response, "url", { value: src });
    const fetcher = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchImageBytes(src)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].signal?.aborted).toBe(true);
  },
);
it("conserva los bytes de una imagen pequeña y omite cuerpos vacíos", async () => {
  const response = new Response(new Uint8Array([1, 2, 3]));
  Object.defineProperty(response, "url", { value: src });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  expect(await fetchImageBytes(src)).toEqual(new Uint8Array([1, 2, 3]));
});
