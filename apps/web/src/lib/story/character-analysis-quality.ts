import type { CharacterCandidate } from "./character-analysis";
export function normalizeCharacterName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}
const LIKELY_PLACES = new Set([
  "lima",
  "cusco",
  "cuzco",
  "arequipa",
  "trujillo",
  "piura",
  "iquitos",
  "tacna",
  "chiclayo",
  "huancayo",
  "puno",
  "amazonas",
  "andes",
]);
function isExplicitPlace(name: string, text: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const landmark = new RegExp(
    `\\b(?:ciudad|pueblo|provincia|país|pais|río|rio|barrio|calle|isla|montaña|montana)\\s+(?:de\\s+)?${escaped}\\b`,
    "iu",
  );
  const travel = new RegExp(
    `\\b(?:viajó|viajo|llegó|llego|partió|partio|regresó|regreso|vivía|vivia|cruzó|cruzo|entró|entro|salió|salio)\\s+(?:a|de|desde|hacia|por|en)\\s+${escaped}\\b`,
    "iu",
  );
  return landmark.test(text) || travel.test(text);
}
export function filterCharacterCandidates(
  candidates: CharacterCandidate[],
  input: {
    bookTitle: string;
    existingCharacterNames: string[];
    sectionText: string;
    minimumConfidence?: number;
  },
): CharacterCandidate[] {
  const title = normalizeCharacterName(input.bookTitle);
  const known = new Set(input.existingCharacterNames.map(normalizeCharacterName));
  const minimum = input.minimumConfidence ?? 0.55;
  return candidates.filter((candidate) => {
    const name = normalizeCharacterName(candidate.name);
    return (
      name.length > 0 &&
      !title.includes(name) &&
      !LIKELY_PLACES.has(name) &&
      !isExplicitPlace(candidate.name, input.sectionText) &&
      !known.has(name) &&
      candidate.confidence >= minimum
    );
  });
}
