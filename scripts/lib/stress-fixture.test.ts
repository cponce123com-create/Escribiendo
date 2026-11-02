import { expect, it } from "vitest";
import { paginate, withTypographyDefaults } from "../../packages/editorial-engine/src/index";
import { fillStressNoise, stressManuscript } from "./stress-fixture";

it("conserva cantidades exactas, fuentes por sección y notas únicas sin sobremuestrear palabras", () => {
  const config = { id: "pequeño", words: 1003, chapters: 10, images: 3, footnotes: 4 };
  const result = stressManuscript(config);
  expect(result).toEqual(stressManuscript(config));
  expect(result.chapters).toHaveLength(10);
  expect(
    result.blocks
      .filter((block) => block.kind === "body")
      .reduce((total, block) => total + block.text.split(/\s+/u).length, 0),
  ).toBe(1003);
  expect(result.blocks.filter((block) => block.kind === "image")).toHaveLength(3);
  const notes = result.blocks.flatMap(
    (block) => block.runs?.flatMap((run) => (run.footnote ? [run.footnote.id] : [])) ?? [],
  );
  expect(new Set(notes).size).toBe(4);
  for (const chapter of result.chapters) {
    expect(
      result.blocks.some((block) => block.sectionId === chapter.id && block.firstOfSection),
    ).toBe(true);
  }
});

it("rechaza tamaños no acotados y distribuciones imposibles", () => {
  const base = { id: "inválido", words: 1000, chapters: 10, images: 0, footnotes: 0 };
  for (const change of [
    { words: 200001 },
    { images: 81 },
    { words: 1 },
    { chapters: 0 },
    { footnotes: 20 },
  ]) {
    expect(() => stressManuscript({ ...base, ...change })).toThrow();
  }
});

it("reproduce el ruido con una semilla fija y cambia al variar la semilla", () => {
  const a = new Uint8Array(100),
    b = new Uint8Array(100),
    c = new Uint8Array(100);
  fillStressNoise(a, 123);
  fillStressNoise(b, 123);
  fillStressNoise(c, 124);
  expect(a).toEqual(b);
  expect(a).not.toEqual(c);
});

it("las llamadas del fixture sobreviven a la paginación real", () => {
  const result = stressManuscript({
    id: "notas",
    words: 1003,
    chapters: 10,
    images: 0,
    footnotes: 4,
  });
  const composition = paginate(
    result.blocks,
    {
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 20,
      marginBottomMm: 20,
      marginInnerMm: 18,
      marginOuterMm: 14,
      gutterMm: 0,
    },
    withTypographyDefaults({}),
  );
  expect(composition.pages.reduce((sum, page) => sum + page.footnotes.length, 0)).toBe(4);
});
