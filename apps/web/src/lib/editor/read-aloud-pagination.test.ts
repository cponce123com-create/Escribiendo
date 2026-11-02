import { describe, expect, it } from "vitest";
import { paginateReaderBlocks, readerPageForBlock } from "./read-aloud-pagination";

describe("paginación del lector de voz", () => {
  it("agrupa párrafos según su altura medida y conserva su orden", () => {
    expect(paginateReaderBlocks([40, 45, 50, 60], 100, 10)).toEqual([[0, 1], [2], [3]]);
  });

  it("mantiene un párrafo más alto que la página como bloque desplazable propio", () => {
    expect(paginateReaderBlocks([180, 20], 100)).toEqual([[0], [1]]);
  });

  it("encuentra la página del párrafo activo sin mover los títulos de capítulo", () => {
    const pages = [
      [0, 1],
      [2, 3],
    ];
    expect(readerPageForBlock(pages, 3)).toBe(1);
    expect(readerPageForBlock(pages, -1)).toBe(0);
  });
});
