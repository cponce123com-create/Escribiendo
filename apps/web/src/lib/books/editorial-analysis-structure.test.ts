import { describe, expect, it } from "vitest";
import { analyzeRhythm, type TiptapTextBlock } from "@escribiendo/book-schema";
import {
  buildRhythmChapterInputs,
  mapEditorialSectionsToChapters,
} from "./editorial-analysis-structure";
import type { SectionNode } from "./section-tree";

function node(id: string, type: string, children: SectionNode[] = []): SectionNode {
  return { id, type, title: id, parentId: null, sortOrder: 0, wordCount: 0, version: 1, children };
}

function paragraph(text: string, startOffset: number): TiptapTextBlock {
  return {
    type: "paragraph",
    paragraphIndex: 0,
    text,
    startOffset,
    endOffset: startOffset + text.length,
    isDialogue: false,
  };
}

describe("mapEditorialSectionsToChapters", () => {
  it("agrupa subcapítulos dentro de su capítulo raíz, no los mezcla entre capítulos", () => {
    const tree = [
      node("parte-1", "PART", [
        node("cap-1", "CHAPTER", [node("sub-1", "SUBCHAPTER"), node("sub-2", "SUBCHAPTER")]),
        node("cap-2", "CHAPTER", [node("sub-3", "SUBCHAPTER")]),
      ]),
    ];

    expect([...mapEditorialSectionsToChapters(tree)]).toEqual([
      ["parte-1", "parte-1"],
      ["cap-1", "cap-1"],
      ["sub-1", "cap-1"],
      ["sub-2", "cap-1"],
      ["cap-2", "cap-2"],
      ["sub-3", "cap-2"],
    ]);
  });

  it("trata prólogos, interludios y epílogos como unidades narrativas separadas", () => {
    const tree = [
      node("prologo", "PROLOGUE", [node("prologo-sub", "SUBCHAPTER")]),
      node("cap-1", "CHAPTER"),
      node("interludio", "INTERLUDE"),
      node("epilogo", "EPILOGUE"),
    ];

    expect([...mapEditorialSectionsToChapters(tree)]).toEqual([
      ["prologo", "prologo"],
      ["prologo-sub", "prologo"],
      ["cap-1", "cap-1"],
      ["interludio", "interludio"],
      ["epilogo", "epilogo"],
    ]);
  });

  it("no incluye páginas preliminares o secciones de referencia", () => {
    const tree = [
      node("portada", "TITLE_PAGE"),
      node("cap-1", "CHAPTER"),
      node("bibliografia", "BIBLIOGRAPHY"),
    ];

    expect([...mapEditorialSectionsToChapters(tree)]).toEqual([["cap-1", "cap-1"]]);
  });

  it("combina los subcapítulos para que la comparación de ritmo sea por capítulo", () => {
    const chapters = buildRhythmChapterInputs(
      [
        {
          id: "cap-1",
          title: "Capítulo I",
          version: 2,
          contentHash: "hash-1",
          blocks: [paragraph("Uno dos.", 1)],
        },
        {
          id: "sub-1",
          title: "Escena A",
          version: 3,
          contentHash: "hash-2",
          blocks: [paragraph("Tres cuatro.", 1)],
        },
        {
          id: "cap-2",
          title: "Capítulo II",
          version: 1,
          contentHash: "hash-3",
          blocks: [paragraph("Cinco.", 1)],
        },
      ],
      new Map([
        ["cap-1", "cap-1"],
        ["sub-1", "cap-1"],
        ["cap-2", "cap-2"],
      ]),
    );
    const analysis = analyzeRhythm(chapters);

    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.blocks.map((block) => block.paragraphIndex)).toEqual([0, 1]);
    expect(analysis.chapters.map((chapter) => chapter.wordCount)).toEqual([4, 1]);
    expect(analysis.chapterLengthVariation.sectionCount).toBe(2);
  });
});
