import { describe, expect, it } from "vitest";
import { emptyTiptapDocument } from "../tiptap";
import { LinguisticAnalysisEngine } from "./engine";
import type { EditorialFinding, EditorialRule, LinguisticSectionInput } from "./types";

function section(
  text: string,
  overrides: Partial<LinguisticSectionInput> = {},
): LinguisticSectionInput {
  return {
    bookId: "book-1",
    sectionId: "section-1",
    sectionTitle: "Capítulo 1",
    sectionType: "CHAPTER",
    contentVersion: 1,
    contentHash: "hash-1",
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    ...overrides,
  };
}

const cafeRule: EditorialRule = {
  id: "test.cafe",
  version: "1",
  category: "orthography",
  severity: "warning",
  confidence: 0.9,
  defaultEnabled: true,
  analyze: (context) =>
    context.tokens
      .filter((token) => token.normalized === "café")
      .map((token) => ({
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        message: "Café detectado.",
        explanation: "Regla determinista de prueba.",
        suggestions: ["café"],
        matchedText: token.text,
      })),
};

const typoRule: EditorialRule = {
  ...cafeRule,
  id: "test.second",
  category: "style",
  analyze: (context) =>
    context.tokens
      .filter((token) => token.normalized === "noir")
      .map((token) => ({
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        message: "Noir detectado.",
        explanation: "Otra regla independiente.",
      })),
};

const options = { rules: [cafeRule] };

describe("LinguisticAnalysisEngine", () => {
  it("analiza segmentos, tokens y offsets UTF-16 contra el snapshot de la sección", () => {
    const input = section("Cafe\u0301 y noir.", { revisionId: "revision-1" });
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [input], options);

    expect(result.stats).toMatchObject({
      sectionsAnalyzed: 1,
      words: 3,
      sentences: 1,
      paragraphs: 1,
      headings: 0,
      cacheHits: 0,
      cacheMisses: 1,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      ruleId: "test.cafe",
      bookId: "book-1",
      sectionId: "section-1",
      revisionId: "revision-1",
      contentVersion: 1,
      contentHash: "hash-1",
      coordinateSystem: "prosemirror-utf16",
      startOffset: 1,
      endOffset: 6,
      matchedText: "Cafe\u0301",
      status: "open",
    });
    expect(result.findings[0]?.id).toContain("revision-1");
  });

  it("permite desactivar una regla por preferencia sin ejecutar sus hallazgos", () => {
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [section("Café")], {
      rules: [cafeRule],
      preferences: { enabledByRuleId: { "test.cafe": false } },
    });
    expect(result.findings).toEqual([]);
  });

  it("respeta el estado previo solo para la misma versión y ancla", () => {
    const engine = new LinguisticAnalysisEngine();
    const first = engine.analyzeSection(section("Café"), options).findings[0];
    expect(first).toBeDefined();

    const prior = { id: first?.id ?? "", status: "ignored" as const } satisfies Pick<
      EditorialFinding,
      "id" | "status"
    >;
    const result = engine.analyzeSection(section("Café"), {
      ...options,
      previousFindings: [prior],
    });
    expect(result.findings[0]?.status).toBe("ignored");
    expect(result.cacheHit).toBe(true);

    const nextVersion = engine.analyzeSection(
      section("Café", { contentVersion: 2, contentHash: "hash-2", revisionId: "revision-2" }),
      { ...options, previousFindings: [prior] },
    );
    expect(nextVersion.findings[0]?.status).toBe("open");
    expect(nextVersion.cacheHit).toBe(false);
  });

  it("ejecuta reglas independientemente y reporta el fallo de una sin ocultar las otras", () => {
    const brokenRule: EditorialRule = {
      ...cafeRule,
      id: "test.broken",
      analyze: () => {
        throw new Error("Error interno de la regla");
      },
    };
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [section("Café noir")], {
      rules: [brokenRule, cafeRule, typoRule],
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(["test.cafe", "test.second"]);
    expect(result.errors).toEqual([
      {
        sectionId: "section-1",
        ruleId: "test.broken",
        message: "La regla falló; las demás reglas de esta sección continuaron.",
      },
    ]);
  });

  it("rechaza rangos fuera del documento y continúa con la regla", () => {
    const invalidRule: EditorialRule = {
      ...cafeRule,
      id: "test.invalid",
      analyze: () => [
        {
          startOffset: 20,
          endOffset: 21,
          message: "Rango incorrecto",
          explanation: "No se debe aceptar.",
        },
      ],
    };
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [section("Café")], {
      rules: [invalidRule, cafeRule],
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(["test.cafe"]);
    expect(result.errors[0]?.ruleId).toBe("test.invalid");
  });

  it("mantiene el conteo compartido de palabras al omitir notas al pie de las anclas", () => {
    const input = section("Texto", {
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Texto " },
              { type: "footnote", attrs: { id: "n1", note: "nota al pie" } },
            ],
          },
        ],
      },
    });
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [input], {
      rules: [
        {
          ...cafeRule,
          id: "test.no-footnote-anchor",
          analyze: (context) => {
            expect(context.tokens.map((token) => token.text)).toEqual(["Texto"]);
            return [];
          },
        },
      ],
    });

    expect(result.stats.words).toBe(4);
    expect(result.findings).toEqual([]);
  });

  it("invalida entradas de otra versión o hash y admite invalidación explícita", () => {
    const engine = new LinguisticAnalysisEngine({ maxCachedSections: 2 });
    expect(engine.analyzeSection(section("Café"), options).cacheHit).toBe(false);
    expect(engine.analyzeSection(section("Café"), options).cacheHit).toBe(true);
    expect(
      engine.analyzeSection(section("Café", { contentHash: "hash-2" }), options).cacheHit,
    ).toBe(false);
    expect(engine.analyzeSection(section("Café"), options).cacheHit).toBe(false);

    engine.invalidateSection("book-1", "section-1");
    expect(engine.analyzeSection(section("Café"), options).cacheHit).toBe(false);
    engine.clearCache();
    expect(engine.analyzeSection(section("Café"), options).cacheHit).toBe(false);
  });

  it("procesa libros por lotes, cede control e informa el avance", async () => {
    const engine = new LinguisticAnalysisEngine();
    const sections = [
      section("Café", { sectionId: "s1" }),
      section("Café", { sectionId: "s2" }),
      section("Café", { sectionId: "s3" }),
    ];
    const progress: Array<[number, number]> = [];
    let yields = 0;
    const result = await engine.analyzeBookInBatches("book-1", sections, {
      rules: [cafeRule],
      batchSize: 2,
      yieldControl: async () => {
        yields += 1;
      },
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(result.findings).toHaveLength(3);
    expect(result.stats.sectionsAnalyzed).toBe(3);
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
    expect(yields).toBe(1);
  });

  it("valida ids de regla, versión y pertenencia al libro", () => {
    const engine = new LinguisticAnalysisEngine();
    expect(() => engine.analyzeBook("otro-libro", [section("Café")], options)).toThrow(
      "pertenecer al mismo libro",
    );
    expect(() => engine.analyzeSection(section("Café"), { rules: [cafeRule, cafeRule] })).toThrow(
      "duplicado",
    );
    expect(() => engine.analyzeSection(section("Café", { contentVersion: 0 }), options)).toThrow(
      "entero positivo",
    );
    expect(() =>
      engine.analyzeSection(section("Café", { document: emptyTiptapDocument }), options),
    ).not.toThrow();
  });
});
