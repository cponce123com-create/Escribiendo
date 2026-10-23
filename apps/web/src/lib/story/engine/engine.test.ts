import { describe, expect, it } from "vitest";
import { analyzeManuscript } from "./index";
import { extractPlainText, normalizeName, splitSentences } from "./text";

const sections = [
  {
    id: "s1",
    title: "El regreso",
    order: 1,
    content: [
      "El doctor Andrés Salazar tenía cuarenta y dos años.",
      "Andrés tenía los ojos verdes y el cabello negro.",
      "Andrés era un hombre alto y delgado.",
      "Andrés trabajaba como médico en el hospital.",
      "Andrés había nacido en Arequipa.",
      "Andrés temía perder a su familia.",
      "—No sé si volver —dijo Andrés.",
    ].join("\n\n"),
  },
  {
    id: "s2",
    title: "La decisión",
    order: 2,
    content: [
      "Andrés tenía cuarenta y cinco años y sus ojos eran azules.",
      "Andrés miró a su hermano Luis y sonrió.",
      "—Luis, tienes que decidir —dijo Andrés.",
      "A Luis le decían el Flaco.",
    ].join("\n\n"),
  },
  {
    id: "s3",
    title: "El hospital",
    order: 3,
    content: "Andrés murió en el hospital. Luis lloró.",
  },
  {
    id: "s4",
    title: "Después",
    order: 4,
    content: "Años después, Luis caminó por la playa junto a Andrés.",
  },
];

describe("extractPlainText", () => {
  it("lee documentos Tiptap sin inventar texto", () => {
    const document = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Andrés llegó a Lima." },
            { type: "hardBreak" },
            { type: "text", text: "Luis lo esperaba." },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "No dijo nada." }],
        },
      ],
    });

    expect(extractPlainText(document)).toBe(
      "Andrés llegó a Lima.\nLuis lo esperaba.\n\nNo dijo nada.",
    );
  });

  it("convierte HTML narrativo y entidades a texto plano", () => {
    expect(extractPlainText("<p>Andrés&nbsp;llegó.</p><p>«Hola».</p>")).toBe(
      "Andrés llegó.\n\n«Hola».",
    );
  });

  it("no trata el documento vacío del editor como texto", () => {
    expect(extractPlainText("{}")).toBe("");
  });
});

describe("splitSentences", () => {
  it("respeta abreviaturas, decimales y diálogos", () => {
    const sentences = splitSentences(
      "El Dr. Salazar llegó a las 10.30. —¿Estás listo? —preguntó Luis. Sí.",
    );

    expect(sentences.map((sentence) => sentence.text)).toEqual([
      "El Dr. Salazar llegó a las 10.30.",
      "—¿Estás listo? —preguntó Luis.",
      "Sí.",
    ]);
  });
});

describe("analyzeManuscript", () => {
  const result = analyzeManuscript(sections);
  const andres = result.characters.find((character) =>
    normalizeName(character.fullName ?? character.primaryName).includes("andres salazar"),
  );
  const luis = result.characters.find(
    (character) =>
      normalizeName(character.primaryName) === "luis" ||
      normalizeName(character.fullName ?? "").includes("luis"),
  );

  it("detecta personajes y conserva nombres completos y variantes", () => {
    expect(andres).toBeDefined();
    expect(andres?.fullName).toBe("Andrés Salazar");
    expect(andres?.variants).toContain("Andrés");
    expect(andres?.mentionCount).toBeGreaterThanOrEqual(5);
    expect(luis).toBeDefined();
    expect(luis?.aliases).toContain("el Flaco");
  });

  it("no convierte lugares ni verbos en personajes", () => {
    const names = result.characters.map((character) => normalizeName(character.primaryName));
    expect(names).not.toContain("arequipa");
    expect(names).not.toContain("lima");
    expect(names).not.toContain("hospital");
    expect(names).not.toContain("temia");
    expect(names).not.toContain("flaco");
  });

  it("extrae hechos explícitos con evidencia y sin completar huecos", () => {
    const fields = new Map((andres?.suggestedFields ?? []).map((fact) => [fact.field, fact.value]));

    expect(fields.get("age")).toMatch(/42|45/);
    expect(fields.get("eyes")).toMatch(/verdes|azules/);
    expect(fields.get("hair")).toBe("Cabello negro");
    expect(fields.get("profession")).toBe("médico");
    expect(fields.get("origin")).toBe("Arequipa");
    expect(fields.get("fears")).toBe("perder a su familia");
    expect(fields.get("height")).toBe("Alto");
  });

  it("atribuye diálogos y apariciones por capítulo", () => {
    expect(andres?.dialogueMentions).toBeGreaterThan(0);
    expect(andres?.appearances).toHaveLength(4);
    expect(andres?.firstSectionTitle).toBe("El regreso");
    expect(andres?.lastSectionTitle).toBe("Después");
    expect(andres?.appearances[0]?.excerpts.some((excerpt) => excerpt.isDialogue)).toBe(true);
  });

  it("detecta relaciones familiares solo entre personajes ya resueltos", () => {
    const relation = andres?.relations.find(
      (candidate) => normalizeName(candidate.toName) === "luis",
    );

    expect(relation).toBeDefined();
    expect(relation?.type).toBe("FAMILY");
    expect(relation?.label).toBe("Hermano");
  });

  it("propone alertas prudentes de continuidad", () => {
    const types = new Set(result.alerts.map((alert) => alert.type));
    expect(types.has("AGE")).toBe(true);
    expect(types.has("EYES")).toBe(true);
    expect(types.has("DEATH")).toBe(true);

    const death = result.alerts.find((alert) => alert.type === "DEATH");
    expect(death?.message).toContain("El hospital");
    expect(death?.message).toContain("Después");
    expect(death?.suggestion).toContain("recuerdo");
  });

  it("ordena las fichas por centralidad narrativa y expone estadísticas reales", () => {
    expect(result.characters[0]?.primaryName).toBe("Andrés Salazar");
    expect(result.stats.sectionsAnalyzed).toBe(4);
    expect(result.stats.charactersDetected).toBe(result.characters.length);
    expect(result.stats.wordsAnalyzed).toBeGreaterThan(40);
    expect(result.warnings.join(" ")).toContain("no se ha enviado");
  });

  it("no fusiona dos personajes distintos que comparten apellido", () => {
    const ambiguous = analyzeManuscript([
      {
        id: "a",
        title: "Uno",
        order: 1,
        content: "Ana Salazar entró en la sala. Ana Salazar miró a su hermano.",
      },
      {
        id: "b",
        title: "Dos",
        order: 2,
        content: "Luis Salazar esperaba afuera. Luis Salazar fumaba.",
      },
    ]);

    const names = ambiguous.characters.map((character) => normalizeName(character.primaryName));
    expect(names).toContain("ana salazar");
    expect(names).toContain("luis salazar");
    expect(ambiguous.characters).toHaveLength(2);
  });

  it("devuelve un resultado seguro con manuscrito vacío", () => {
    const empty = analyzeManuscript([{ id: "empty", title: "Vacío", order: 1, content: "{}" }]);

    expect(empty.characters).toEqual([]);
    expect(empty.alerts).toEqual([]);
    expect(empty.warnings.join(" ")).toContain("vacía");
  });
});
