import { describe, expect, it } from "vitest";
import { chaptersForReflowableFormats } from "./chapter-titles";
import type { ManuscriptBlock } from "./manuscript";

describe("capítulos de EPUB y DOCX", () => {
  it("conserva el título de sección y elimina el primer bloque duplicado", () => {
    const blocks: ManuscriptBlock[] = [
      { kind: "heading", text: "C A P Í T U L O   I" },
      { kind: "body", text: "Empieza la historia." },
    ];
    const [chapter] = chaptersForReflowableFormats(
      [{ id: "c1", title: "Capítulo I", type: "CHAPTER" }],
      [blocks],
    );

    expect(chapter?.showTitle).toBe(true);
    expect(chapter?.blocks.map((block) => block.text)).toEqual(["Empieza la historia."]);
  });

  it("activa la inicial solo para capítulos que abren sección", () => {
    const chapters = chaptersForReflowableFormats(
      [
        { id: "c1", title: "Capítulo I", type: "CHAPTER" },
        { id: "s1", title: "Una pausa", type: "SUBCHAPTER" },
        { id: "d1", title: "Dedicatoria", type: "DEDICATION" },
      ],
      [
        [{ kind: "body", text: "Empieza el capítulo." }],
        [{ kind: "body", text: "Continúa el capítulo." }],
        [{ kind: "body", text: "A quien lee." }],
      ],
      true,
    );

    expect(chapters.map((chapter) => chapter.dropCap)).toEqual([true, false, false]);
  });

  it("no genera título para portada, dedicatoria ni copyright", () => {
    const sections = [
      { id: "s1", title: "Cubierta", type: "COVER" },
      { id: "s2", title: "Dedicatoria", type: "DEDICATION" },
      { id: "s3", title: "Derechos", type: "COPYRIGHT" },
    ];
    const chapters = chaptersForReflowableFormats(
      sections,
      sections.map(() => [{ kind: "body", text: "Texto original." }]),
    );

    expect(chapters.every((chapter) => chapter.showTitle === false)).toBe(true);
    expect(chapters.every((chapter) => chapter.blocks[0]?.text === "Texto original.")).toBe(true);
  });

  it("convierte el título de un subcapítulo en heading2", () => {
    const [chapter] = chaptersForReflowableFormats(
      [{ id: "s1", title: "Una pausa", type: "SUBCHAPTER" }],
      [[{ kind: "body", text: "Continúa el capítulo." }]],
    );

    expect(chapter?.showTitle).toBe(false);
    expect(chapter?.blocks.map((block) => [block.kind, block.text])).toEqual([
      ["heading", "Una pausa"],
      ["body", "Continúa el capítulo."],
    ]);
  });
});

it("passes the hierarchy and TOC visibility from the manuscript to reflowable formats", () => {
  const chapters = chaptersForReflowableFormats(
    [
      { id: "part", title: "Parte I", type: "PART", showInToc: false },
      { id: "chapter", parentId: "part", title: "Capítulo I", type: "CHAPTER", showInToc: true },
      { id: "sub", parentId: "chapter", title: "Una pausa", type: "SUBCHAPTER" },
    ],
    [[], [], []],
  );
  expect(chapters[0]?.showInToc).toBe(false);
  expect(chapters[1]?.parentId).toBe("part");
  expect(chapters[1]?.showInToc).toBe(true);
  expect(chapters[2]?.blocks[0]).toEqual({ kind: "heading", level: 2, text: "Una pausa" });
});
