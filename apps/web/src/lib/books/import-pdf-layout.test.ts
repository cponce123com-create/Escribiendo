import { expect, it } from "vitest";
import { pdfImportBlocks, type PdfImportPage } from "./import-pdf-layout";
const line = (str: string, y: number, x = 40, height = 11) => ({
  str,
  hasEOL: true,
  transform: [height, 0, 0, height, x, y],
  height,
  width: str.length * 5,
});
it("reúne renglones en párrafos, separa párrafos y respeta capítulos", () => {
  const pages: PdfImportPage[] = [
    {
      height: 800,
      items: [
        line("Capítulo 1", 700, 40, 18),
        line("Una historia que sigue", 650),
        line("en el renglón siguiente.", 637),
        line("Otro párrafo.", 610),
      ],
    },
  ];
  expect(pdfImportBlocks(pages).blocks.map((block) => block.text)).toEqual([
    "Capítulo 1",
    "Una historia que sigue en el renglón siguiente.",
    "Otro párrafo.",
  ]);
});
it("retira encabezados y folios repetidos en los márgenes sin borrar texto del cuerpo", () => {
  const pages = Array.from({ length: 3 }, (_, i) => ({
    height: 800,
    items: [
      line("Título de la novela", 780),
      line("Texto conservado.", 650),
      line(String(i + 1), 20),
    ],
  }));
  const result = pdfImportBlocks(pages);
  expect(result.removed).toBe(6);
  expect(result.blocks.map((block) => block.text).join(" ")).toBe(
    "Texto conservado. Texto conservado. Texto conservado.",
  );
});
it("ordena visualmente los renglones cuando los objetos llegan desordenados", () => {
  const result = pdfImportBlocks([
    { height: 800, items: [line("Segundo renglón.", 637), line("Primer renglón.", 650)] },
  ]);
  expect(result.blocks[0]?.text).toBe("Primer renglón. Segundo renglón.");
});

it("un encabezado repetido de capítulo no crea capítulos duplicados", () => {
  const pages = Array.from({ length: 3 }, () => ({
    height: 800,
    items: [line("Capítulo 1", 780), line("Texto que continúa.", 650)],
  }));
  const result = pdfImportBlocks(pages);
  expect(result.removed).toBe(2);
  expect(result.blocks.filter((block) => block.text === "Capítulo 1")).toHaveLength(1);
});
