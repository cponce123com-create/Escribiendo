import { describe, expect, it } from "vitest";
import { parseTiptapDocument } from "../tiptap";
import {
  detectNarrativeInconsistencies,
  extractNarrativeFacts,
  type AnalyzeNarrativeSectionInput,
} from "./continuity";

const character = { id: "char-1", name: "Lucía" };
function input(sectionId: string, text: string, contentVersion = 1): AnalyzeNarrativeSectionInput {
  return {
    sectionId,
    sectionTitle: sectionId,
    contentVersion,
    contentHash: `hash-${sectionId}-${contentVersion}`,
    document: parseTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }),
    characters: [character],
  };
}

describe("extractNarrativeFacts", () => {
  it("conserva citas literales y offsets UTF-16 compatibles con ProseMirror", () => {
    const text = "😀 Lucía tenía los ojos verdes.";
    const result = extractNarrativeFacts(input("cap-1", text));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      factType: "EYES",
      valueText: "verde",
      exactQuote: text,
      startOffset: 1,
      endOffset: 1 + text.length,
      evidenceMode: "NARRATION",
    });
    expect(text.slice(result[0]!.startOffset - 1, result[0]!.endOffset - 1)).toBe(text);
  });

  it("etiqueta por separado diálogo, recuerdo e hipótesis", () => {
    const dialogue = extractNarrativeFacts(input("dialogo", "—Lucía tenía los ojos azules."));
    const memory = extractNarrativeFacts(
      input("recuerdo", "Lucía recordaba que tenía los ojos verdes."),
    );
    const hypothesis = extractNarrativeFacts(
      input("hipotesis", "Quizá Lucía tenía los ojos marrones."),
    );
    expect(dialogue[0]?.evidenceMode).toBe("DIALOGUE");
    expect(memory[0]?.evidenceMode).toBe("RECOLLECTION");
    expect(hypothesis[0]?.evidenceMode).toBe("HYPOTHESIS");
  });

  it("extrae año de nacimiento, edad y año narrativo sin convertir diálogo en canon", () => {
    const birth = extractNarrativeFacts(input("nacimiento", "Lucía nació en 1995."));
    const age = extractNarrativeFacts(input("edad", "En 2020, Lucía tenía 40 años."));
    expect(birth[0]).toMatchObject({ factType: "BIRTH_YEAR", valueText: "1995" });
    expect(age[0]).toMatchObject({ factType: "AGE", valueText: "40", temporalYear: 2020 });
  });

  it("propone una variante ortográfica de nombre sin fusionar personajes", () => {
    const result = extractNarrativeFacts({
      ...input("variantes", "Viktoria llegó al puerto."),
      characters: [{ id: "char-v", name: "Victoria" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      factType: "NAME_VARIANT",
      subjectLabel: "Victoria",
      valueText: "Viktoria",
    });
  });

  it("señala una grafía cercana a un lugar registrado sin fusionarla", () => {
    const result = extractNarrativeFacts({
      ...input("lugar", "Líma queda cerca de la costa."),
      characters: [],
      places: [{ id: "place-lima", name: "Lima" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      factType: "PLACE_VARIANT",
      subjectLabel: "Lima",
      valueText: "Líma",
    });
  });

  it("se abstiene si la grafía candidata ya está registrada como otro personaje", () => {
    const result = extractNarrativeFacts({
      ...input("ambiguo", "Lucia entró en la sala."),
      characters: [
        { id: "char-accent", name: "Lucía" },
        { id: "char-plain", name: "Lucia" },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("se abstiene ante negación explícita", () => {
    expect(
      extractNarrativeFacts(input("negacion", "Lucía no tenía los ojos verdes.")),
    ).toHaveLength(0);
  });

  it("no atribuye a un personaje la edad de un objeto mencionado como complemento", () => {
    expect(
      extractNarrativeFacts(input("falso-positivo", "La casa de Lucía tenía 30 años.")),
    ).toHaveLength(0);
  });
});

describe("detectNarrativeInconsistencies", () => {
  it("marca un cambio explícito de color físico entre capítulos", () => {
    const facts = [
      ...extractNarrativeFacts(input("cap-2", "Lucía tenía los ojos verdes.")),
      ...extractNarrativeFacts(input("cap-15", "Los ojos azules de Lucía brillaban.")),
    ].map((item, index) => ({ ...item, id: `fact-${index}` }));
    const findings = detectNarrativeInconsistencies(facts);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: "PHYSICAL_ATTRIBUTE",
      factA: { valueText: "verde" },
      factB: { valueText: "azul" },
    });
  });

  it("no infiere contradicción a partir de afirmaciones de diálogo o recuerdos", () => {
    const facts = [
      ...extractNarrativeFacts(input("cap-2", "Lucía tenía los ojos verdes.")),
      ...extractNarrativeFacts(input("cap-15", "—Lucía tenía los ojos azules.")),
    ];
    expect(detectNarrativeInconsistencies(facts)).toHaveLength(0);
  });

  it("solo incorpora una afirmación dialogada al canon después de confirmación autoral", () => {
    const narrative = extractNarrativeFacts(input("cap-2", "Lucía tenía los ojos verdes."))[0]!;
    const dialogue = extractNarrativeFacts(input("cap-15", "—Lucía tenía los ojos azules."))[0]!;
    const findings = detectNarrativeInconsistencies([
      { ...narrative, id: "narrado" },
      { ...dialogue, id: "dialogo", reviewStatus: "CONFIRMED" },
    ]);
    expect(findings).toHaveLength(1);
  });

  it("detecta incompatibilidad explícita entre nacimiento y edad", () => {
    const facts = [
      ...extractNarrativeFacts(input("cap-2", "Lucía nació en 1995.")),
      ...extractNarrativeFacts(input("cap-15", "En 2020, Lucía tenía 40 años.")),
    ].map((item, index) => ({ ...item, id: `chron-${index}` }));
    expect(detectNarrativeInconsistencies(facts)).toEqual([
      expect.objectContaining({
        type: "CHRONOLOGY",
        factA: expect.objectContaining({ factType: "BIRTH_YEAR" }),
        factB: expect.objectContaining({ factType: "AGE" }),
      }),
    ]);
  });

  it("no marca como contradicción una edad que cambia conforme pasa el tiempo", () => {
    const facts = [
      ...extractNarrativeFacts(input("cap-2", "En 2010, Lucía tenía 15 años.")),
      ...extractNarrativeFacts(input("cap-15", "En 2020, Lucía tenía 25 años.")),
    ];
    expect(detectNarrativeInconsistencies(facts)).toHaveLength(0);
  });
});
