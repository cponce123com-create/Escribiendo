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
