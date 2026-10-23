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
  "madrid",
  "barcelona",
  "paris",
  "londres",
  "roma",
  "berlin",
  "tokio",
  "new york",
  "mexico",
  "bogota",
  "quito",
  "caracas",
  "medellin",
  "cusco",
  "chanchamayo",
  "satipo",
  "oxapampa",
  "selva central",
]);
const NON_NAME_WORDS = new Set([
  "hombre",
  "hola",
  "adiós",
  "adios",
  "gracias",
  "perdón",
  "perdon",
  "oye",
  "venga",
  "vamos",
  "claro",
  "mujer",
  "muchacho",
  "muchacha",
  "niño",
  "niña",
  "joven",
  "anciano",
  "anciana",
  "señor",
  "señora",
  "doctor",
  "doctora",
  "profesor",
  "profesora",
  "capítulo",
  "prólogo",
  "epílogo",
  "parte",
  "mañana",
  "tarde",
  "noche",
  "día",
  "semana",
  "mes",
  "año",
  "tiempo",
  "casa",
  "puerta",
  "ventana",
  "habitación",
  "camino",
  "calle",
  "ciudad",
  "pueblo",
  "río",
  "mar",
  "montaña",
  "bosque",
  "viento",
  "lluvia",
  "tierra",
  "cielo",
  "muerte",
  "historia",
  "misterio",
  "misterios",
  "nada",
  "algo",
  "todo",
  "nadie",
  "alguien",
  "entonces",
  "después",
  "ahora",
  "mientras",
  "durante",
  "finalmente",
  "alrededor",
  "primero",
  "segundo",
  "tercero",
  "luego",
  "antes",
  "así",
  "donde",
  "todavía",
  "cuando",
  "porque",
  "aunque",
  "pero",
  "además",
  "quizá",
  "talvez",
  "bien",
  "mal",
  "otro",
  "otra",
  "mismo",
  "misma",
  "gran",
  "grande",
  "nuevo",
  "nueva",
]);
const STOP_NAME_PARTS = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "y",
  "e",
  "o",
  "u",
  "en",
  "por",
  "para",
  "con",
  "sin",
  "sobre",
  "entre",
  "desde",
  "hasta",
  "hacia",
  "que",
  "se",
  "su",
  "sus",
  "mi",
  "mis",
  "tu",
  "tus",
  "yo",
  "me",
  "te",
  "lo",
  "le",
  "les",
]);
const SHORT_NAME_PARTS = new Set([
  "ada",
  "ana",
  "ari",
  "eva",
  "ian",
  "ivo",
  "leo",
  "luz",
  "noe",
  "sol",
]);

function hasNameShape(value: string): boolean {
  const parts = value.trim().split(/\s+/u);

  return (
    parts.length <= 3 &&
    parts.every(
      (part) =>
        /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{1,}(?:[-'][A-ZÁÉÍÓÚÜÑ]?[a-záéíóúüñ]{1,})?$/u.test(part) &&
        (part.length >= 4 || SHORT_NAME_PARTS.has(normalizeCharacterName(part))),
    ) &&
    !parts.some((part) => {
      const normalized = normalizeCharacterName(part);
      return STOP_NAME_PARTS.has(normalized) || NON_NAME_WORDS.has(normalized);
    })
  );
}
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
    const evidenceAcrossSections =
      new Set(candidate.evidence.map((evidence) => evidence.section)).size > 1;
    const independentNameEvidence =
      candidate.name.includes(" ") ||
      candidate.evidence.some((evidence) => evidence.kind === "dialogue") ||
      evidenceAcrossSections ||
      (candidate.mentions >= 3 && candidate.confidence >= 0.72 && candidate.evidence.length >= 2);
    return (
      name.length > 0 &&
      hasNameShape(candidate.name) &&
      independentNameEvidence &&
      candidate.mentions >= 2 &&
      candidate.confidence >= Math.max(minimum, 0.72) &&
      !title.includes(name) &&
      !LIKELY_PLACES.has(name) &&
      !isExplicitPlace(candidate.name, input.sectionText) &&
      !known.has(name) &&
      candidate.confidence >= minimum
    );
  });
}
