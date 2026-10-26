import { describe, expect, it } from "vitest";
import { buildGlossaryDocument } from "./glossary";

describe("buildGlossaryDocument", () => {
  it("ordena los términos alfabéticamente y los pone en negrita", () => {
    const document = buildGlossaryDocument([
      { term: "Zeugma", definition: "Figura que omite una palabra." },
      { term: "anáfora", definition: "Repetición al inicio." },
      { term: "Metáfora", definition: "Sustitución por semejanza." },
    ]);

    expect(document.type).toBe("doc");
    expect(document.content).toHaveLength(3);

    const terms = document.content?.map((node) => node.content?.[0]?.text);

    expect(terms).toEqual(["anáfora", "Metáfora", "Zeugma"]);
    expect(document.content?.[0]?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
    expect(document.content?.[0]?.content?.[1]?.text).toBe(". Repetición al inicio.");
  });

  it("devuelve un documento vacío sin términos", () => {
    expect(buildGlossaryDocument([])).toEqual({ type: "doc", content: [] });
  });
});
