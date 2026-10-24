import { describe, expect, it } from "vitest";
import { parseTiptapDocument } from "../tiptap";
import { extractTiptapTextBlocks } from "./text";
import { analyzeRhythm, RHYTHM_ANALYSIS_LIMITS, type RhythmChapterInput } from "./rhythm";

function makeChapter(
  sectionId: string,
  paragraphs: readonly string[],
  contentVersion = 1,
): RhythmChapterInput {
  const document = parseTiptapDocument({
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  });
  return {
    sectionId,
    sectionTitle: `Capítulo ${sectionId}`,
    contentVersion,
    contentHash: `hash-${sectionId}-${contentVersion}`,
    blocks: extractTiptapTextBlocks(document),
  };
}

describe("analyzeRhythm", () => {
  it("maneja libro sin capítulos y protege variación con cero capítulos", () => {
    const result = analyzeRhythm([]);
    expect(result.chapters).toEqual([]);
    expect(result.chapterLengthVariation).toEqual({
      sectionCount: 0,
      meanWords: 0,
      standardDeviationWords: 0,
      standardDeviationKind: "population",
      coefficientOfVariation: null,
    });
    expect(result.series.wordsByChapter).toEqual([]);
  });

  it("cuenta capítulos vacíos y párrafos vacíos sin dividir por cero", () => {
    const result = analyzeRhythm([makeChapter("empty", ["", "   "])]);
    const chapter = result.chapters[0];

    expect(chapter?.wordCount).toBe(0);
    expect(chapter?.paragraphCount).toBe(2);
    expect(chapter?.sentenceCount).toBe(0);
    expect(chapter?.meanParagraphWords).toBe(0);
    expect(chapter?.dialogueWordPercentage).toBeNull();
    expect(chapter?.nonDialogueNarrationWordPercentage).toBeNull();
    expect(chapter?.paragraphLengthDistribution[0]?.paragraphCount).toBe(2);
    expect(result.chapterLengthVariation.coefficientOfVariation).toBeNull();
  });

  it("calcula variación poblacional de extensión entre capítulos y el caso de una sección", () => {
    const result = analyzeRhythm([
      makeChapter("a", ["Luz."]),
      makeChapter("b", ["La luz brilla."]),
    ]);

    expect(result.chapters.map((chapter) => chapter.wordCount)).toEqual([1, 3]);
    expect(result.chapterLengthVariation).toEqual({
      sectionCount: 2,
      meanWords: 2,
      standardDeviationWords: 1,
      standardDeviationKind: "population",
      coefficientOfVariation: 0.5,
    });

    const oneChapter = analyzeRhythm([makeChapter("solo", ["Una palabra."])]);
    expect(oneChapter.chapterLengthVariation).toEqual({
      sectionCount: 1,
      meanWords: 2,
      standardDeviationWords: 0,
      standardDeviationKind: "population",
      coefficientOfVariation: 0,
    });
  });

  it("usa solo isDialogue (incluida la heurística de raya) para porcentajes de diálogo", () => {
    const result = analyzeRhythm([
      makeChapter("dialogue", ["—¿Vienes, Ana?", "Ella respondió que sí."]),
    ]);
    const chapter = result.chapters[0];

    expect(chapter?.wordCount).toBe(6);
    expect(chapter?.dialogueWordCount).toBe(2);
    expect(chapter?.dialogueWordPercentage).toBe(33.33);
    expect(chapter?.nonDialogueNarrationWordCount).toBe(4);
    expect(chapter?.nonDialogueNarrationWordPercentage).toBe(66.67);
    expect(result.note).toContain("no miden tensión ni calidad narrativa");
    expect(result.note).toContain("raya (—) o semirraya (–)");

    const blocks = makeChapter("heuristic", ["Ella dijo que venía."]).blocks;
    expect(blocks[0]?.isDialogue).toBe(false);
    expect(
      analyzeRhythm([{ ...makeChapter("heuristic", []), blocks }]).chapters[0]?.dialogueWordCount,
    ).toBe(0);
  });

  it("mide oraciones por párrafo con segmentación española y conserva offsets/versiones", () => {
    const source = makeChapter(
      "es",
      ["El Dr. López llegó. ¿Todo bien?", "—¡Claro! Luego salió."],
      7,
    );
    const result = analyzeRhythm([source]);
    const chapter = result.chapters[0];

    expect(chapter?.paragraphs.map(({ sentenceCount }) => sentenceCount)).toEqual([2, 2]);
    expect(chapter?.sentenceCount).toBe(4);
    expect(chapter?.paragraphs.map(({ paragraphIndex }) => paragraphIndex)).toEqual([0, 1]);
    expect(chapter?.paragraphs[0]?.startOffset).toBe(source.blocks[0]?.startOffset);
    expect(chapter?.paragraphs[0]?.endOffset).toBe(source.blocks[0]?.endOffset);
    expect(chapter?.contentVersion).toBe(7);
    expect(chapter?.contentHash).toBe("hash-es-7");
    expect(result.coordinateSystem).toBe("prosemirror-utf16");
    expect(result.series.sentencesByParagraph.map((point) => point.value)).toEqual([2, 2]);
  });

  it("devuelve series de comparación y distribución de longitud de párrafos", () => {
    const result = analyzeRhythm([
      makeChapter("chart", ["Dos palabras.", "Una frase aquí y más.", ""]),
    ]);
    const chapter = result.chapters[0];

    expect(chapter?.meanParagraphWords).toBe(2.33);
    expect(
      chapter?.paragraphLengthDistribution.find((bucket) => bucket.id === "0")?.paragraphCount,
    ).toBe(1);
    expect(
      chapter?.paragraphLengthDistribution.find((bucket) => bucket.id === "1-25")?.paragraphCount,
    ).toBe(2);
    expect(result.series.wordsByChapter).toEqual([
      { sectionId: "chart", sectionTitle: "Capítulo chart", contentVersion: 1, value: 7 },
    ]);
    expect(result.series.meanParagraphWordsByChapter[0]?.value).toBe(2.33);
    expect(result.series.paragraphLengthDistribution).toHaveLength(8);
  });

  it("rechaza entradas que superan los límites antes de producir resultados parciales", () => {
    const oversized = Array.from({ length: RHYTHM_ANALYSIS_LIMITS.maxChapters + 1 }, (_, index) =>
      makeChapter(String(index), []),
    );
    expect(() => analyzeRhythm(oversized)).toThrow(RangeError);
  });
});
