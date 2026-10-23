import { describe, expect, it } from "vitest";
import {
  analyzeAndFilterCharacterCandidates,
  filterCharacterCandidates,
} from "./character-analysis-quality";
import {
  analyzeNarrative,
  type CharacterCandidate,
  type CharacterEvidence,
} from "./character-analysis";
const person = (
  name: string,
  confidence = 0.8,
  mentions = 3,
  evidence: CharacterEvidence[] = [],
): CharacterCandidate => ({
  name,
  mentions,
  role: "OTHER",
  confidence,
  evidence,
  aliases: [],
});
describe("quality gate for incremental character suggestions", () => {
  it("excludes the book title and proper-name fragments already in its title", () => {
    expect(
      filterCharacterCandidates(
        [
          person("La casa de Elena"),
          person("Elena"),
          person("Bruno", 0.8, 3, [
            { section: "Capítulo 1", excerpt: "Bruno entró.", confidence: 0.8, kind: "entity" },
            { section: "Capítulo 1", excerpt: "Bruno respondió.", confidence: 0.8, kind: "entity" },
          ]),
        ],
        {
          bookTitle: "La casa de Elena",
          existingCharacterNames: [],
          sectionText: "Bruno entra.",
        },
      ).map((candidate) => candidate.name),
    ).toEqual(["Bruno"]);
  });
  it("excludes known places and place-use evidence instead of proposing them as people", () => {
    expect(
      filterCharacterCandidates(
        [
          person("Lima"),
          person("Madrid"),
          person("Lucía", 0.8, 3, [
            { section: "Capítulo 1", excerpt: "Lucía llegó.", confidence: 0.8, kind: "entity" },
            { section: "Capítulo 1", excerpt: "Lucía miró.", confidence: 0.8, kind: "entity" },
          ]),
        ],
        {
          bookTitle: "Cuaderno",
          existingCharacterNames: [],
          sectionText: "Viajó a Madrid. Lucía llegó.",
        },
      ).map((candidate) => candidate.name),
    ).toEqual(["Lucía"]);
  });
  it("avoids duplicating an existing character and rejects low confidence", () => {
    expect(
      filterCharacterCandidates([person("Sofía"), person("Mateo", 0.4)], {
        bookTitle: "Novela",
        existingCharacterNames: ["Sofía"],
        sectionText: "Sofía habló.",
      }),
    ).toEqual([]);
  });

  it("rejects isolated capitalized sentence fragments and generic nouns", () => {
    expect(
      filterCharacterCandidates(
        [
          person("Durante la noche", 0.91),
          person("Durante", 0.9),
          person("Misterios", 0.88),
          person("Niv", 0.99),
          person("T-D", 0.99),
        ],
        {
          bookTitle: "Novela",
          existingCharacterNames: [],
          sectionText: "Durante la noche los misterios volvieron.",
        },
      ),
    ).toEqual([]);
  });

  it("filters false positives from the actual manuscript detector", () => {
    const candidates = analyzeNarrative([
      {
        title: "Capítulo uno",
        text: "Durante la noche, los Misterios regresaron. Niv miró el reloj. Niv volvió. T-D falló.",
      },
    ]);

    expect(
      filterCharacterCandidates(candidates, {
        bookTitle: "Novela",
        existingCharacterNames: [],
        sectionText:
          "Durante la noche, los Misterios regresaron. Niv miró el reloj. Niv volvió. T-D falló.",
      }),
    ).toEqual([]);
  });

  it("requires repeated evidence and rejects a single occurrence even with inflated confidence", () => {
    expect(
      filterCharacterCandidates([person("Alejandro Ríos", 0.99, 1)], {
        bookTitle: "Novela",
        existingCharacterNames: [],
        sectionText: "Alejandro Ríos apareció en la puerta.",
      }),
    ).toEqual([]);
  });

  it("descarta saludos usados como diálogo y conserva nombres y apellidos", () => {
    const sectionText =
      "—Hola, Clara —dijo Andrés. —Hola, Andrés —respondió Clara. —Hola, Clara —repitió Andrés. " +
      "María Fernanda Ríos llegó al pueblo. María Fernanda Ríos habló con Clara. " +
      "María Fernanda Ríos volvió a casa.";

    const filtered = analyzeAndFilterCharacterCandidates(
      [{ title: "Capítulo tres", text: sectionText }],
      { bookTitle: "Novela", existingCharacterNames: [] },
    );
    const names = filtered.map((candidate) => candidate.name);

    expect(names).not.toContain("Hola");
    expect(names).toContain("María Fernanda Ríos");
  });

  it("keeps repeated, well-formed names while suppressing common words", () => {
    expect(
      filterCharacterCandidates([person("Ana Sol", 0.8), person("Tarde", 0.9)], {
        bookTitle: "Novela",
        existingCharacterNames: [],
        sectionText: "Ana Sol abrió la ventana. Ana Sol miró hacia fuera.",
      }).map((candidate) => candidate.name),
    ).toEqual(["Ana Sol"]);
  });
});
