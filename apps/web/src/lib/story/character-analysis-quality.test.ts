import { describe, expect, it } from "vitest";
import { filterCharacterCandidates } from "./character-analysis-quality";
import type { CharacterCandidate } from "./character-analysis";
const person = (name: string, confidence = 0.8): CharacterCandidate => ({
  name,
  mentions: 3,
  role: "OTHER",
  confidence,
  evidence: [],
  aliases: [],
});
describe("quality gate for incremental character suggestions", () => {
  it("excludes the book title and proper-name fragments already in its title", () => {
    expect(
      filterCharacterCandidates([person("La casa de Elena"), person("Elena"), person("Bruno")], {
        bookTitle: "La casa de Elena",
        existingCharacterNames: [],
        sectionText: "Bruno entra.",
      }).map((candidate) => candidate.name),
    ).toEqual(["Bruno"]);
  });
  it("excludes known places and place-use evidence instead of proposing them as people", () => {
    expect(
      filterCharacterCandidates([person("Lima"), person("Madrid"), person("Lucía")], {
        bookTitle: "Cuaderno",
        existingCharacterNames: [],
        sectionText: "Viajó a Madrid. Lucía llegó.",
      }).map((candidate) => candidate.name),
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
});
