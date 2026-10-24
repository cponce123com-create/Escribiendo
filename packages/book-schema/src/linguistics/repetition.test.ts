import { describe, expect, it } from "vitest";
import { parseTiptapDocument } from "../tiptap";
import { analyzeRepetition, type RepetitionSectionInput } from "./repetition";

function section(
  sectionId: string,
  text: string,
  chapterId = "cap-1",
  bookId = "libro-1",
): RepetitionSectionInput {
  return {
    bookId,
    sectionId,
    chapterId,
    contentVersion: 3,
    contentHash: `hash-${sectionId}`,
    document: parseTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }),
  };
}

describe("analyzeRepetition", () => {
  it("detecta palabras significativas repetidas a distancia y conserva anclas UTF-16 exactas", () => {
    const text =
      "😀 La viajera cruzó el bosque oscuro, siguió el río durante horas y volvió al bosque.";
    const result = analyzeRepetition([section("sec-1", text)]);
    const bosque = result.observations.find(
      (item) =>
        item.algorithm === "exact-significant-word-v1" &&
        item.matchedText.toLocaleLowerCase("es") === "bosque",
    );

    expect(bosque).toBeDefined();
    expect(bosque?.scope).toBe("chapter");
    expect(bosque?.score).toBe(1);
    expect(
      text.slice((bosque?.first.startOffset ?? 0) - 1, (bosque?.first.endOffset ?? 0) - 1),
    ).toBe("bosque");
    expect(
      text.slice((bosque?.second.startOffset ?? 0) - 1, (bosque?.second.endOffset ?? 0) - 1),
    ).toBe("bosque");
    expect(bosque?.first.coordinateSystem).toBe("prosemirror-utf16");
    expect(bosque?.first.startOffset).toBe(1 + text.indexOf("bosque"));
    expect(bosque?.second.startOffset).toBe(1 + text.lastIndexOf("bosque"));
    expect(bosque?.id).toMatch(/^rep_v1_[0-9a-f]{16}$/u);
  });

  it("detecta frases n-gram exactas evitando secuencias de palabras funcionales", () => {
    const repeated = "el valle silencioso";
    const text = `La viajera cruzó ${repeated} y después recordó ${repeated} al anochecer.`;
    const result = analyzeRepetition([section("sec-phrase", text)]);
    const phrase = result.observations.find(
      (item) => item.algorithm === "exact-phrase-ngram-v1" && item.matchedText === repeated,
    );

    expect(phrase).toBeDefined();
    expect(phrase?.first.startOffset).toBe(1 + text.indexOf(repeated));
    expect(phrase?.second.startOffset).toBe(1 + text.lastIndexOf(repeated));
    expect(phrase && phrase.first.endOffset - phrase.first.startOffset).toBe(repeated.length);

    const functionalOnly = analyzeRepetition([
      section("sec-functional", "de la de la, por el y con la."),
    ]);
    expect(functionalOnly.observations.filter((item) => item.kind === "phrase")).toHaveLength(0);
  });

  it("distingue repeticiones dentro del capítulo y entre capítulos", () => {
    const sameChapterA = section(
      "sec-a",
      "El cuaderno guarda una memoria antigua y valiosa.",
      "cap-a",
    );
    const sameChapterB = section("sec-b", "La memoria regresó cuando cayó la noche.", "cap-a");
    const otherChapter = section("sec-c", "Su memoria sobrevivió a los inviernos largos.", "cap-b");
    const result = analyzeRepetition([sameChapterA, sameChapterB, otherChapter], {
      minWordDistance: 0,
    });
    const memories = result.observations.filter(
      (item) =>
        item.algorithm === "exact-significant-word-v1" &&
        item.matchedText.toLocaleLowerCase("es") === "memoria",
    );

    expect(
      memories.some(
        (item) =>
          item.scope === "chapter" &&
          item.first.chapterId === "cap-a" &&
          item.second.chapterId === "cap-a",
      ),
    ).toBe(true);
    expect(
      memories.some(
        (item) => item.scope === "book" && item.first.chapterId !== item.second.chapterId,
      ),
    ).toBe(true);
  });

  it("calcula similitud textual acotada y advierte que no acredita redundancia semántica", () => {
    const first =
      "La exploradora encontró una antigua brújula de cobre junto al río y guardó cuidadosamente aquel objeto en su mochila.";
    const second =
      "La exploradora encontró una antigua brújula de cobre junto al río y guardó cuidadosamente aquel objeto bajo su abrigo.";
    const distinct =
      "El pintor mezcló pigmentos azules sobre el lienzo mientras la tormenta golpeaba con fuerza las ventanas del estudio.";
    const result = analyzeRepetition(
      [
        section("sim-a", first),
        section("sim-b", second, "cap-2"),
        section("sim-c", distinct, "cap-3"),
      ],
      { paragraphSimilarityThreshold: 0.8 },
    );
    const similarities = result.observations.filter((item) => item.kind === "paragraph-similarity");

    expect(
      similarities.some(
        (item) => item.algorithm === "paragraph-tfidf-cosine-v1" && item.score >= 0.8,
      ),
    ).toBe(true);
    expect(
      similarities.every((item) => item.explanation.includes("no demuestra redundancia semántica")),
    ).toBe(true);
    expect(
      similarities.every(
        (item) => item.first.sectionId !== "sim-c" && item.second.sectionId !== "sim-c",
      ),
    ).toBe(true);
  });

  it("devuelve identificadores deterministas e informa cuando aplica límites", () => {
    const input = [
      section("limit-a", "La montaña distante ocultaba un sendero antiguo junto al río."),
      section("limit-b", "La montaña distante ocultaba un sendero antiguo junto al río.", "cap-2"),
    ];
    const first = analyzeRepetition(input);
    const repeatedCall = analyzeRepetition(input);
    expect(first.observations.map((item) => item.id)).toEqual(
      repeatedCall.observations.map((item) => item.id),
    );

    const paragraphLimited = analyzeRepetition(input, { maxParagraphs: 1 });
    expect(paragraphLimited.truncated).toBe(true);
    expect(paragraphLimited.limitsHit).toContain("maxParagraphs");

    const candidateLimited = analyzeRepetition(input, { maxCandidatePairs: 1, minWordDistance: 0 });
    expect(candidateLimited.truncated).toBe(true);
    expect(candidateLimited.limitsHit).toContain("maxCandidatePairs");
    expect(candidateLimited.observations.length).toBeLessThanOrEqual(1);
  });
});
