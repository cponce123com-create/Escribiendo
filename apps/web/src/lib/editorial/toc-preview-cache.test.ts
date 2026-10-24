import { describe, expect, it } from "vitest";
import { tocPreviewCacheKey } from "./toc-preview-cache";

describe("firma de la miniatura del índice", () => {
  it("ignora el orden de las claves", () => {
    expect(tocPreviewCacheKey({ a: 1, b: { c: 2, d: 3 } })).toBe(
      tocPreviewCacheKey({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("cambia con contenidos, parámetros, configuración y portada", () => {
    const base = {
      bookId: "b",
      parameters: { tocTemplate: "toc-standard" },
      sections: [{ id: "s", content: { text: "uno" } }],
      edition: { id: "e", profile: { pageWidthMm: 148 } },
      cover: null,
    };
    const key = tocPreviewCacheKey(base);

    expect(tocPreviewCacheKey({ ...base, parameters: { tocTemplate: "toc-detailed" } })).not.toBe(
      key,
    );
    expect(
      tocPreviewCacheKey({ ...base, sections: [{ id: "s", content: { text: "dos" } }] }),
    ).not.toBe(key);
    expect(
      tocPreviewCacheKey({ ...base, edition: { id: "e", profile: { pageWidthMm: 152 } } }),
    ).not.toBe(key);
    expect(
      tocPreviewCacheKey({ ...base, cover: { url: "https://cdn.example.com/p.jpg" } }),
    ).not.toBe(key);
  });

  it("distingue fechas y tipos", () => {
    expect(tocPreviewCacheKey({ at: new Date("2026-10-24T00:00:00Z") })).not.toBe(
      tocPreviewCacheKey({ at: new Date("2026-10-25T00:00:00Z") }),
    );
    expect(tocPreviewCacheKey({ value: 1 })).not.toBe(tocPreviewCacheKey({ value: "1" }));
  });
});
