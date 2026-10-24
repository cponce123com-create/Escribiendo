import { describe, expect, it } from "vitest";
import { LinguisticAnalysisEngine } from "./engine";
import { createSpanishStyleRules } from "./style-rules";
import type { LinguisticSectionInput } from "./types";

function section(
  text: string,
  overrides: Partial<LinguisticSectionInput> = {},
): LinguisticSectionInput {
  return {
    bookId: "book-style",
    sectionId: "chapter-style",
    sectionTitle: "La casa junto al río",
    sectionType: "CHAPTER",
    contentVersion: 1,
    contentHash: "style-hash-1",
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    ...overrides,
  };
}

function analyze(text: string, options: Parameters<typeof createSpanishStyleRules>[0] = {}) {
  return new LinguisticAnalysisEngine().analyzeSection(section(text), {
    rules: createSpanishStyleRules(options),
  });
}

function findingsFor(
  text: string,
  ruleId: string,
  options: Parameters<typeof createSpanishStyleRules>[0] = {},
) {
  return analyze(text, options).findings.filter(
    (finding) => finding.ruleId === `es.style.${ruleId}`,
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const allRuleIds = [
  "es.style.repeated-connectors",
  "es.style.frequent-fillers",
  "es.style.mente-adverbs",
  "es.style.long-sentences",
  "es.style.long-paragraphs",
  "es.style.known-redundancies",
  "es.style.potential-ambiguity",
  "es.style.verbose-constructions",
  "es.style.punctuation-patterns",
];

describe("createSpanishStyleRules", () => {
  it("devuelve reglas independientes, versionadas, informativas o de advertencia y estables", () => {
    const first = createSpanishStyleRules();
    const second = createSpanishStyleRules();
    expect(first).not.toBe(second);
    expect(first.map((rule) => rule.id)).toEqual(allRuleIds);
    expect(first.map(({ id, version }) => [id, version])).toEqual(
      second.map(({ id, version }) => [id, version]),
    );
    expect(first.every((rule) => rule.severity === "info" || rule.severity === "warning")).toBe(
      true,
    );
  });

  it("señala como posible recurso la repetición de tres «Entonces» y ancla cada repetición posterior", () => {
    const text = "Entonces abrió la puerta. Entonces oyó un ruido. Entonces huyó.";
    const result = analyze(text);
    const hits = result.findings.filter(
      (finding) => finding.ruleId === "es.style.repeated-connectors",
    );
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => text.slice(hit.startOffset - 1, hit.endOffset - 1))).toEqual([
      "Entonces",
      "Entonces",
    ]);
    expect(hits.every((hit) => hit.severity === "info")).toBe(true);
    expect(hits[0]?.message).toContain("revisar");
    expect(hits[0]?.explanation).toContain("recurso retórico deliberado");
  });

  it("detecta muletillas que se repiten y conserva offsets exactos tras un carácter astral", () => {
    const text = "😀 Pues, la lluvia empezó. Pues, nadie salió. Pues, la calle quedó vacía.";
    const hits = findingsFor(text, "frequent-fillers");
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => text.slice(hit.startOffset - 1, hit.endOffset - 1))).toEqual([
      "Pues",
      "Pues",
    ]);
    expect(hits[0]?.startOffset).toBe(text.indexOf("Pues", text.indexOf("Pues") + 1) + 1);
  });

  it("sugiere revisar acumulaciones de adverbios en -mente en una oración", () => {
    const text = "La barca avanzó lentamente, silenciosamente, torpemente y peligrosamente.";
    const hits = findingsFor(text, "mente-adverbs");
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.startOffset - 1, hits[0]!.endOffset - 1)).toBe("peligrosamente");
  });

  it("usa umbrales configurables y rangos de oración y párrafo", () => {
    const sentenceText =
      "La noche cubrió el valle mientras la última campana llamaba a los viajeros.";
    const sentenceHits = findingsFor(sentenceText, "long-sentences", {
      thresholds: { longSentenceWords: 8 },
    });
    expect(sentenceHits).toHaveLength(1);
    expect(
      sentenceText.slice(sentenceHits[0]!.startOffset - 1, sentenceHits[0]!.endOffset - 1),
    ).toBe(sentenceText);

    const paragraphText =
      "La niebla cubría el río. Los juncos rozaban la barca. Nadie encendió la lámpara.";
    const paragraphHits = findingsFor(paragraphText, "long-paragraphs", {
      thresholds: { longParagraphWords: 10 },
    });
    expect(paragraphHits).toHaveLength(1);
    expect(paragraphHits[0]).toMatchObject({ startOffset: 1, endOffset: paragraphText.length + 1 });
  });

  it("reconoce redundancias conocidas sin tratarlas como errores", () => {
    const text = "El niño volvió a repetir la historia bajo la lluvia.";
    const hits = findingsFor(text, "known-redundancies");
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.startOffset - 1, hits[0]!.endOffset - 1)).toBe("volvió a repetir");
    expect(hits[0]?.severity).toBe("info");
  });

  it("marca expresiones potencialmente ambiguas de forma tentativa y permite omitir una expresión", () => {
    const text = "Marta habló con Elena sobre su decisión.";
    const hits = findingsFor(text, "potential-ambiguity");
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.startOffset - 1, hits[0]!.endOffset - 1)).toBe("su");
    expect(hits[0]?.explanation).toContain("no es necesariamente ambigua");
    expect(findingsFor(text, "potential-ambiguity", { allowlist: ["su"] })).toEqual([]);
  });

  it("señala construcciones perifrásticas solo al superar el umbral", () => {
    const text = "El consejo decidió llevar a cabo la búsqueda y proceder a cerrar el camino.";
    const hits = findingsFor(text, "verbose-constructions", {
      thresholds: { constructionsPerSection: 1 },
    });
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.startOffset - 1, hits[0]!.endOffset - 1)).toBe("proceder a");
  });

  it("detecta patrones prudentes de puntuación y señala exactamente el signo", () => {
    const text = "La viajera miró ,y señaló,mañana.";
    const hits = findingsFor(text, "punctuation-patterns");
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => text.slice(hit.startOffset - 1, hit.endOffset - 1))).toEqual([
      " ,",
      ",",
    ]);
  });

  it("permite desactivar una regla con preferencias del motor y no muta el documento", () => {
    const input = section("Entonces abrió la puerta. Entonces oyó un ruido. Entonces huyó.");
    const frozen = deepFreeze(structuredClone(input.document));
    const before = structuredClone(frozen);
    const result = new LinguisticAnalysisEngine().analyzeSection(
      { ...input, document: frozen },
      {
        rules: createSpanishStyleRules(),
        preferences: { enabledByRuleId: { "es.style.repeated-connectors": false } },
      },
    );
    expect(
      result.findings.some((finding) => finding.ruleId === "es.style.repeated-connectors"),
    ).toBe(false);
    expect(frozen).toEqual(before);
  });

  it("rechaza umbrales no positivos o no enteros", () => {
    expect(() => createSpanishStyleRules({ thresholds: { fillerOccurrences: 0 } })).toThrow(
      RangeError,
    );
    expect(() => createSpanishStyleRules({ thresholds: { longSentenceWords: 2.5 } })).toThrow(
      RangeError,
    );
  });
});
