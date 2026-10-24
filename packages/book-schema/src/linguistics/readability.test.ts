import { describe, expect, it } from "vitest";
import { emptyTiptapDocument } from "../tiptap";
import { analyzeReadability, countSpanishSyllables, READABILITY_METADATA } from "./readability";
import type { LinguisticSectionInput } from "./types";

function documentFromParagraphs(paragraphs: readonly string[]) {
  return {
    type: "doc" as const,
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  };
}

function section(sectionId: string, text: string): LinguisticSectionInput {
  return {
    bookId: "libro-1",
    sectionId,
    sectionTitle: `Sección ${sectionId}`,
    contentVersion: 1,
    contentHash: `hash-${sectionId}`,
    document: documentFromParagraphs([text]),
  };
}

describe("conteo silábico español aproximado", () => {
  it("distingue diptongos, hiatos, tildes y diéresis en ejemplos literarios", () => {
    expect(countSpanishSyllables("cielo")).toBe(2); // diptongo
    expect(countSpanishSyllables("poesía")).toBe(4); // dos hiatos
    expect(countSpanishSyllables("baúl")).toBe(2); // hiato con tilde
    expect(countSpanishSyllables("pingüino")).toBe(3); // ü pronunciada; ui como diptongo
    expect(countSpanishSyllables("lingüística")).toBe(4); // ü pronunciada junto a una í tónica
    expect(countSpanishSyllables("La")).toBe(1);
    expect(countSpanishSyllables("...")).toBe(0);
  });
});

describe("analyzeReadability", () => {
  it("calcula FH en forma convencional y escalable, Szigriszt y métricas españolas", () => {
    const analysis = analyzeReadability(
      documentFromParagraphs(["La poesía guarda un cielo azul."]),
    );
    const metrics = analysis.aggregate.metrics;

    expect(metrics.counts).toEqual({ words: 6, sentences: 1, syllables: 12 });
    expect(metrics.variables).toMatchObject({
      P: 200,
      F: 16.67,
      syllablesPerWord: 2,
      wordsPerSentence: 6,
    });
    expect(metrics.scores.fernandezHuerta.conventional).toBe(69.84);
    expect(metrics.scores.fernandezHuerta.scalableEquivalent).toBe(69.84);
    expect(metrics.scores.szigrisztPazos).toBe(76.4);
    expect(metrics.averages.wordsPerSentence).toBe(6);
    expect(metrics.averages.charactersPerWord).toBe(4.17);
    expect(metrics.sample.shortText).toBe(true);
    expect(metrics.sample.fewSentences).toBe(true);
    expect(metrics.interpretation.band).toBe("accesible");
    expect(analysis.metadata.fernandezHuerta.ambiguity).toContain("posible inversión/error");
    expect(analysis.metadata.syllableCounting.approximate).toBe(true);
    expect(analysis.metadata.scoreCaveat).toContain("no califican");
  });

  it("devuelve null y datos serializables en cero palabras, cero oraciones y documento vacío", () => {
    const analysis = analyzeReadability(emptyTiptapDocument);
    const metrics = analysis.aggregate.metrics;

    expect(metrics.counts).toEqual({ words: 0, sentences: 0, syllables: 0 });
    expect(metrics.variables).toEqual({
      P: null,
      F: null,
      syllablesPerWord: null,
      wordsPerSentence: null,
      syllablesPerSentence: null,
    });
    expect(metrics.scores.fernandezHuerta).toEqual({
      conventional: null,
      scalableEquivalent: null,
    });
    expect(metrics.scores.szigrisztPazos).toBeNull();
    expect(metrics.paragraphs).toMatchObject({ total: 1, nonEmpty: 0, empty: 1, meanWords: null });
    expect(metrics.interpretation.band).toBe("insufficient-data");
    expect(() => JSON.stringify(analysis)).not.toThrow();
  });

  it("maneja documentos/secciones múltiples y agrega métricas con pesos por recuento", () => {
    const analysis = analyzeReadability([
      section("cap-1", "La poesía guarda un cielo azul."),
      section("cap-2", "El río calla."),
    ]);

    expect(analysis.documents.map(({ documentId, title }) => [documentId, title])).toEqual([
      ["cap-1", "Sección cap-1"],
      ["cap-2", "Sección cap-2"],
    ]);
    expect(analysis.aggregate.documentCount).toBe(2);
    expect(analysis.aggregate.metrics.counts).toEqual({ words: 9, sentences: 2, syllables: 17 });
    expect(analysis.aggregate.metrics.paragraphs).toMatchObject({
      total: 2,
      nonEmpty: 2,
      meanWords: 4.5,
    });
    expect(analysis.aggregate.metrics.variables.wordsPerSentence).toBe(4.5);
  });

  it("presenta distribución y estadística de párrafos sin incluir encabezados en esos conteos", () => {
    const document = {
      type: "doc" as const,
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Título" }] },
        ...documentFromParagraphs(["uno dos", "", "una historia breve"]).content,
        documentFromParagraphs(["una historia breve"]).content[0]!,
      ],
    };
    const paragraphs = analyzeReadability(document).aggregate.metrics.paragraphs;

    expect(paragraphs).toMatchObject({
      total: 4,
      nonEmpty: 3,
      empty: 1,
      meanWords: 2.67,
      medianWords: 3,
      minWords: 2,
      maxWords: 3,
      distribution: { "1-19": 3, "20-49": 0, "50-99": 0, "100-199": 0, "200+": 0 },
    });
  });

  it("expone constantes orientativas estables para consumidores sin crear exports compartidos", () => {
    expect(READABILITY_METADATA.version).toBe(1);
    expect(analyzeReadability([]).aggregate).toMatchObject({
      documentCount: 0,
      metrics: { counts: { words: 0 } },
    });
  });
});
