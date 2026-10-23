import type {
  CharacterEventCandidate,
  CharacterFactCandidate,
  CharacterFieldKey,
  EventType,
  EvidenceKind,
  NameOccurrence,
} from "./types";
import type { NameCluster } from "./names";
import { excerptFromSentence, normalizeName, type Sentence } from "./text";

export interface CharacterSentence {
  sentence: Sentence;
  occurrence: NameOccurrence;
  key: string;
}

const NUMBER_WORDS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciséis: 16,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintiún: 21,
  veintidós: 22,
  veintidos: 22,
  veintitrés: 23,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiséis: 26,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
};

/** Convierte «cuarenta y dos» o «42» en 42. Devuelve null si no hay un número válido. */
export function parseSpanishNumber(value: string): number | null {
  const cleaned = normalizeName(value)
    .replace(/\b(?:anos|ano|años|año)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  if (/^\d{1,3}$/.test(cleaned)) {
    const numeric = Number.parseInt(cleaned, 10);
    return numeric > 0 && numeric <= 130 ? numeric : null;
  }

  const tokens = cleaned.split(" ").filter((token) => token !== "y" && token !== "e");
  if (tokens.length === 0) return null;

  let total = 0;
  for (const token of tokens) {
    const number = NUMBER_WORDS[token];
    if (number === undefined) return null;
    total += number;
  }

  return total > 0 && total <= 130 ? total : null;
}

function sentenceKey(sectionId: string, sentence: Sentence): string {
  return `${sectionId}:${sentence.start}`;
}

export function characterSentences(cluster: NameCluster): CharacterSentence[] {
  const seen = new Map<string, CharacterSentence>();

  for (const occurrence of cluster.occurrences) {
    const sentence: Sentence = {
      text: occurrence.sentenceText,
      start: occurrence.sentenceStart,
      end: occurrence.sentenceEnd,
      index: occurrence.sentenceIndex,
    };
    const key = sentenceKey(occurrence.sectionId, sentence);
    if (!seen.has(key)) {
      seen.set(key, { sentence, occurrence, key });
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) =>
      a.occurrence.sectionOrder - b.occurrence.sectionOrder || a.sentence.start - b.sentence.start,
  );
}

function cleanValue(value: string, maxLength = 180): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:—–.-]+|[\s,;:—–.-]+$/g, "")
    .replace(/\s+(?:y|e|pero|aunque|porque)\s*$/i, "")
    .slice(0, maxLength)
    .trim();
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

interface FieldSpec {
  field: CharacterFieldKey;
  regex: RegExp;
  evidence: string;
  source: EvidenceKind;
  confidence: number;
  value: (match: RegExpExecArray) => string | null;
}

const NATIONALITIES: Record<string, string> = {
  peruano: "Peruano",
  peruana: "Peruana",
  limeño: "Limeño",
  limeña: "Limeña",
  arequipeño: "Arequipeño",
  arequipena: "Arequipeña",
  cusqueño: "Cusqueño",
  cusquena: "Cusqueña",
  piurano: "Piurano",
  piurana: "Piurana",
  argentino: "Argentino",
  argentina: "Argentina",
  chileno: "Chileno",
  chilena: "Chilena",
  colombiano: "Colombiano",
  colombiana: "Colombiana",
  mexicano: "Mexicano",
  mexicana: "Mexicana",
  ecuatoriano: "Ecuatoriano",
  ecuatoriana: "Ecuatoriana",
  boliviano: "Boliviano",
  boliviana: "Boliviana",
  venezolano: "Venezolano",
  venezolana: "Venezolana",
  uruguayo: "Uruguayo",
  uruguaya: "Uruguaya",
  brasileño: "Brasileño",
  brasilena: "Brasileña",
  español: "Español",
  espanol: "Español",
  española: "Española",
  espanola: "Española",
  italiano: "Italiano",
  italiana: "Italiana",
  francés: "Francés",
  frances: "Francés",
  francesa: "Francesa",
  alemán: "Alemán",
  aleman: "Alemán",
  alemana: "Alemana",
  estadounidense: "Estadounidense",
  norteamericano: "Norteamericano",
  norteamericana: "Norteamericana",
};

const PROFESSIONS = [
  "médico",
  "medico",
  "médica",
  "medica",
  "abogado",
  "abogada",
  "profesor",
  "profesora",
  "maestro",
  "maestra",
  "ingeniero",
  "ingeniera",
  "arquitecto",
  "arquitecta",
  "periodista",
  "escritor",
  "escritora",
  "poeta",
  "enfermero",
  "enfermera",
  "policía",
  "policia",
  "soldado",
  "militar",
  "sacerdote",
  "monja",
  "comerciante",
  "campesino",
  "campesina",
  "obrero",
  "obrera",
  "empleado",
  "empleada",
  "funcionario",
  "funcionaria",
  "artista",
  "pintor",
  "pintora",
  "músico",
  "musico",
  "actor",
  "actriz",
  "cocinero",
  "cocinera",
  "chofer",
  "conductor",
  "agricultor",
  "agricultora",
  "pescador",
  "pescadora",
  "minero",
  "minera",
  "contador",
  "contadora",
  "psicólogo",
  "psicologo",
  "psicóloga",
  "psicologa",
  "bibliotecario",
  "bibliotecaria",
  "fotógrafo",
  "fotografo",
  "fotógrafa",
  "traductor",
  "traductora",
];

const PERSONALITY_WORDS = [
  "amable",
  "tímido",
  "timido",
  "tímida",
  "timida",
  "valiente",
  "cobarde",
  "generoso",
  "generosa",
  "egoísta",
  "egoista",
  "serio",
  "seria",
  "alegre",
  "triste",
  "solitario",
  "reservado",
  "reservada",
  "impulsivo",
  "impulsiva",
  "paciente",
  "impaciente",
  "orgulloso",
  "orgullosa",
  "humilde",
  "cruel",
  "bondadoso",
  "bondadosa",
  "inteligente",
  "astuto",
  "astuta",
  "ingenuo",
  "ingenua",
  "desconfiado",
  "desconfiada",
  "leal",
  "honesto",
  "honesta",
  "mentiroso",
  "mentirosa",
  "violento",
  "violenta",
  "tranquilo",
  "tranquila",
  "nervioso",
  "nerviosa",
  "obstinado",
  "obstinada",
  "terco",
  "terca",
  "sensible",
  "frío",
  "frio",
  "fría",
  "fria",
  "cariñoso",
  "cariñosa",
  "distante",
  "melancólico",
  "melancolico",
  "melancólica",
  "melancolica",
  "optimista",
  "pesimista",
  "rebelde",
  "obediente",
  "trabajador",
  "trabajadora",
  "perezoso",
  "perezosa",
  "ambicioso",
  "ambiciosa",
];

const SPECIAL_FEATURES =
  /(cicatriz|tatuaje|lunar|marca de nacimiento|mancha|cojera|parche|gafas|anteojos|barba|bigote|canas?|calvo|calva|aretes|pendientes|piercing)/iu;

const NATIONALITY_REGEX = new RegExp(
  `\\b(${Object.keys(NATIONALITIES)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "iu",
);

const PROFESSION_REGEX = new RegExp(`\\b(${PROFESSIONS.join("|")})\\b`, "iu");
const PERSONALITY_REGEX = new RegExp(`\\b(${PERSONALITY_WORDS.join("|")})\\b`, "iu");

const FIELD_SPECS: FieldSpec[] = [
  {
    field: "age",
    regex: /\b(?:a los|a sus|ten[ií]a|tiene|de|con)\s+(\d{1,3})\s+años\b/iu,
    evidence: "Edad mencionada de forma explícita",
    source: "EXPLICIT",
    confidence: 0.93,
    value: (match) => (match[1] ? `${match[1]} años` : null),
  },
  {
    field: "age",
    regex:
      /\b(?:a los|a sus|ten[ií]a|tiene|de|con)\s+([a-záéíóúüñ]+(?:\s+(?:y\s+)?[a-záéíóúüñ]+){0,4})\s+años\b/iu,
    evidence: "Edad mencionada de forma explícita",
    source: "EXPLICIT",
    confidence: 0.9,
    value: (match) => {
      const parsed = parseSpanishNumber(match[1] ?? "");
      return parsed === null ? null : `${parsed} años`;
    },
  },
  {
    field: "birthDate",
    regex: /\b(?:nació|nacio)\s+(?:el\s+)?(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})\b/iu,
    evidence: "Fecha de nacimiento mencionada",
    source: "EXPLICIT",
    confidence: 0.9,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "birthDate",
    regex: /\b(?:nació|nacio)\s+(?:en\s+)?(\d{4})\b/iu,
    evidence: "Año de nacimiento mencionado",
    source: "EXPLICIT",
    confidence: 0.82,
    value: (match) => (match[1] ? match[1] : null),
  },
  {
    field: "gender",
    regex:
      /\b(?:era|es|fue)\s+(?:un|una)\s+(hombre|mujer|varón|varon|muchacho|muchacha|niño|nino|niña|nina)\b/iu,
    evidence: "Género descrito en el texto",
    source: "EXPLICIT",
    confidence: 0.78,
    value: (match) => {
      const word = normalizeName(match[1] ?? "");
      if (["hombre", "varon", "muchacho", "nino"].includes(word)) return "Hombre";
      if (["mujer", "muchacha", "nina"].includes(word)) return "Mujer";
      return match[1] ? capitalize(match[1]) : null;
    },
  },
  {
    field: "nationality",
    regex: NATIONALITY_REGEX,
    evidence: "Nacionalidad o procedencia mencionada",
    source: "EXPLICIT",
    confidence: 0.82,
    value: (match) => (match[1] ? (NATIONALITIES[normalizeName(match[1])] ?? null) : null),
  },
  {
    field: "origin",
    regex:
      /\b(?:nació|había nacido|habia nacido|era|es|provenía|provenia|venía|venia|natural|oriundo|oriunda)\s+(?:en|de)\s+(?:la ciudad de\s+|el pueblo de\s+)?([\p{Lu}][\p{L}'’.-]*(?:\s+(?:de|del|la|las|los|y)\s+[\p{Lu}][\p{L}'’.-]*|\s+[\p{Lu}][\p{L}'’.-]*){0,3})/iu,
    evidence: "Lugar de origen mencionado",
    source: "EXPLICIT",
    confidence: 0.84,
    value: (match) => (match[1] ? cleanValue(match[1], 80) : null),
  },
  {
    field: "profession",
    regex:
      /\b(?:trabajaba|trabaja|se desempeñaba|se desempenaba|se dedicaba|ejercía|ejercia)\s+como\s+([^,.;:!?]{2,60})/iu,
    evidence: "Oficio mencionado en el texto",
    source: "EXPLICIT",
    confidence: 0.88,
    value: (match) => {
      if (!match[1]) return null;
      const cleaned = cleanValue(match[1], 80)
        .replace(/\s+en\s+.*$/iu, "")
        .trim();
      return cleaned || null;
    },
  },
  {
    field: "profession",
    regex: PROFESSION_REGEX,
    evidence: "Profesión mencionada",
    source: "EXPLICIT",
    confidence: 0.76,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "height",
    regex:
      /\b(?:medía|media|mide|de estatura)\s+(\d(?:[,.]\d{1,2})?\s*(?:m|metros|cm|centímetros|centimetros))\b/iu,
    evidence: "Estatura mencionada",
    source: "EXPLICIT",
    confidence: 0.9,
    value: (match) => (match[1] ? match[1] : null),
  },
  {
    field: "height",
    regex: /\b(?:era|es|fue)\s+(alto|alta|bajo|baja)\b/iu,
    evidence: "Estatura descrita de forma indirecta",
    source: "INFERRED",
    confidence: 0.7,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "height",
    regex:
      /\b(?:era|es|fue)\s+(?:un|una)\s+(?:hombre|mujer|joven|muchacho|muchacha|niño|nino|niña|nina)\s+(alto|alta|bajo|baja)\b/iu,
    evidence: "Estatura descrita en la presentación del personaje",
    source: "INFERRED",
    confidence: 0.76,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "build",
    regex:
      /\b(?:era|es|fue)\s+(?:un|una)\s+(?:hombre|mujer|joven|muchacho|muchacha|niño|nino|niña|nina)\s+(?:alto|alta|bajo|baja)\s+y\s+(delgado|delgada|corpulento|corpulenta|robusto|robusta|atético|atetico|esbelto|esbelta|gordo|gorda)\b/iu,
    evidence: "Complexión descrita en la presentación del personaje",
    source: "EXPLICIT",
    confidence: 0.8,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "build",
    regex:
      /\b(?:complexión|complexion|contextura)\s+(delgada|delgado|robusta|robusto|atética|atetica|atletica|atletica|media|fuerte|frágil|fragil)\b/iu,
    evidence: "Complexión mencionada",
    source: "EXPLICIT",
    confidence: 0.84,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "build",
    regex:
      /\b(?:era|es|fue)\s+(delgado|delgada|corpulento|corpulenta|robusto|robusta|atético|atetico|esbelto|esbelta|gordo|gorda)\b/iu,
    evidence: "Complexión descrita",
    source: "EXPLICIT",
    confidence: 0.74,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "build",
    regex:
      /\b(?:era|es|fue)\s+(?:un|una)\s+(?:hombre|mujer|joven|muchacho|muchacha|niño|nino|niña|nina)\s+(delgado|delgada|corpulento|corpulenta|robusto|robusta|atético|atetico|esbelto|esbelta|gordo|gorda)\b/iu,
    evidence: "Complexión descrita en la presentación del personaje",
    source: "EXPLICIT",
    confidence: 0.8,
    value: (match) => (match[1] ? capitalize(match[1]) : null),
  },
  {
    field: "hair",
    regex:
      /\b(?:cabello|pelo)\s+(?:de color\s+)?([a-záéíóúüñ]+(?:\s+(?:y|,)\s+[a-záéíóúüñ]+){0,2})\b/iu,
    evidence: "Cabello descrito",
    source: "EXPLICIT",
    confidence: 0.84,
    value: (match) => (match[1] ? `Cabello ${cleanValue(match[1], 60)}` : null),
  },
  {
    field: "eyes",
    regex:
      /\bojos\s+(?:de color\s+)?(?:eran|son|estaban|están|estan)?\s*(azules|verdes|marrones|castaños|castanos|negros|grises|celestes|claros|oscuros)\b/iu,
    evidence: "Color de ojos mencionado",
    source: "EXPLICIT",
    confidence: 0.9,
    value: (match) => (match[1] ? `Ojos ${cleanValue(match[1], 40)}` : null),
  },
  {
    field: "clothing",
    regex: /\b(?:vestía|vestia|llevaba|usaba)\s+([^.;]{3,100})/iu,
    evidence: "Vestimenta descrita",
    source: "EXPLICIT",
    confidence: 0.68,
    value: (match) => (match[1] ? `Vestía ${cleanValue(match[1], 100)}` : null),
  },
  {
    field: "personality",
    regex: /\b(?:era|es|fue|parecía|parecia|se mostraba)\s+(?:muy\s+)?([a-záéíóúüñ]+)\b/iu,
    evidence: "Rasgo de personalidad mencionado",
    source: "EXPLICIT",
    confidence: 0.67,
    value: (match) => {
      const word = match[1] ?? "";
      return PERSONALITY_REGEX.test(word) ? capitalize(word) : null;
    },
  },
  {
    field: "personality",
    regex: /\b(?:de carácter|de caracter|de personalidad)\s+([^,.;]{2,60})/iu,
    evidence: "Carácter descrito",
    source: "EXPLICIT",
    confidence: 0.78,
    value: (match) => (match[1] ? cleanValue(match[1], 60) : null),
  },
  {
    field: "fears",
    regex:
      /\b(?:temía|temia|tenía miedo de|tenia miedo de|le aterraba|le aterrorizaba|su mayor miedo era|su miedo era)\s+([^.;]{3,120})/iu,
    evidence: "Miedo mencionado",
    source: "EXPLICIT",
    confidence: 0.78,
    value: (match) => (match[1] ? cleanValue(match[1], 120) : null),
  },
  {
    field: "desires",
    regex: /\b(?:deseaba|quería|queria|soñaba con|sonaba con|anhelaba|ansiaba)\s+([^.;]{3,120})/iu,
    evidence: "Deseo mencionado",
    source: "EXPLICIT",
    confidence: 0.71,
    value: (match) => (match[1] ? cleanValue(match[1], 120) : null),
  },
  {
    field: "motivations",
    regex:
      /\b(?:lo movía|lo movia|su motivación era|su motivacion era|luchaba por|estaba decidido a)\s+([^.;]{3,120})/iu,
    evidence: "Motivación mencionada",
    source: "EXPLICIT",
    confidence: 0.75,
    value: (match) => (match[1] ? cleanValue(match[1], 120) : null),
  },
  {
    field: "internalConflicts",
    regex:
      /\b(?:dudaba entre|se debatía entre|se debatia entre|no sabía si|no sabia si|estaba dividido entre)\s+([^.;]{5,140})/iu,
    evidence: "Conflicto interno mencionado",
    source: "EXPLICIT",
    confidence: 0.76,
    value: (match) => (match[1] ? cleanValue(match[1], 140) : null),
  },
  {
    field: "secrets",
    regex:
      /\b(?:ocultaba|ocultaba que|guardaba un secreto|nadie sabía que|nadie sabia que|en secreto)\s+([^.;]{3,140})/iu,
    evidence: "Secreto mencionado",
    source: "INFERRED",
    confidence: 0.66,
    value: (match) => (match[1] ? cleanValue(match[1], 140) : null),
  },
  {
    field: "background",
    regex:
      /\b(?:había nacido|habia nacido|creció|crecio|se crio|de niño|de nino|de joven|años atrás|anos atras)\s+([^.;]{3,160})/iu,
    evidence: "Antecedente biográfico mencionado",
    source: "EXPLICIT",
    confidence: 0.63,
    value: (match) => (match[1] ? cleanValue(match[1], 160) : null),
  },
  {
    field: "narrativeGoals",
    regex:
      /\b(?:su objetivo era|su meta era|tenía que|tenia que|debía|debia|necesitaba)\s+([^.;]{3,120})/iu,
    evidence: "Objetivo narrativo mencionado",
    source: "EXPLICIT",
    confidence: 0.65,
    value: (match) => (match[1] ? cleanValue(match[1], 120) : null),
  },
  {
    field: "evolution",
    regex:
      /\b(?:cambió|cambio|empezó a|empezo a|comenzó a|comenzo a|dejó de|dejo de|aprendió a|aprendio a|se transformó|se transformo)\s+([^.;]{3,120})/iu,
    evidence: "Evolución del personaje mencionada",
    source: "EXPLICIT",
    confidence: 0.68,
    value: (match) => (match[1] ? cleanValue(match[1], 120) : null),
  },
  {
    field: "fate",
    regex:
      /(?<![\p{L}\p{N}])(?:murió|murio|falleció|fallecio|desapareció|desaparecio|sobrevivió|sobrevivio|terminó|termino|acabó|acabo)(?![\p{L}\p{N}])/iu,
    evidence: "Destino mencionado",
    source: "EXPLICIT",
    confidence: 0.7,
    value: (match) => (match[0] ? capitalize(match[0]) : null),
  },
];

function addFact(
  facts: CharacterFactCandidate[],
  seen: Map<string, CharacterFactCandidate>,
  cluster: NameCluster,
  entry: CharacterSentence,
  field: CharacterFieldKey,
  value: string,
  matchIndex: number,
  matchLength: number,
  source: EvidenceKind,
  confidence: number,
  evidence: string,
): void {
  const cleaned = cleanValue(value);
  if (!cleaned) return;

  const key = `${field}:${normalizeName(cleaned)}`;
  const existing = seen.get(key);
  if (existing && existing.confidence >= confidence) return;

  const offset = entry.sentence.start + Math.max(0, matchIndex);
  const excerpt = excerptFromSentence(
    entry.sentence,
    offset,
    offset + Math.max(1, matchLength),
    260,
  );

  const fact: CharacterFactCandidate = {
    characterKey: cluster.key,
    characterName: cluster.primaryName,
    field,
    value: cleaned,
    excerpt,
    sectionId: entry.occurrence.sectionId,
    sectionTitle: entry.occurrence.sectionTitle,
    sectionOrder: entry.occurrence.sectionOrder,
    offset,
    confidence: Math.min(0.98, Math.max(0.2, confidence)),
    source,
    evidence,
  };

  seen.set(key, fact);
  facts.push(fact);
}

/**
 * Extrae datos respaldados por una frase concreta. No completa huecos por
 * lógica: si el manuscrito no dice la edad, no se propone una edad.
 */
export function extractFactsForCharacter(
  cluster: NameCluster,
  ambiguousSentenceKeys: Set<string> = new Set(),
): CharacterFactCandidate[] {
  const facts: CharacterFactCandidate[] = [];
  const seen = new Map<string, CharacterFactCandidate>();

  for (const entry of characterSentences(cluster)) {
    const ambiguous = ambiguousSentenceKeys.has(entry.key);
    const baseConfidence = ambiguous ? 0.75 : 1;

    for (const spec of FIELD_SPECS) {
      spec.regex.lastIndex = 0;
      const match = spec.regex.exec(entry.sentence.text);
      if (!match) continue;

      const value = spec.value(match);
      if (!value) continue;

      // «Era un hombre» describe, pero no permite deducir nombre o edad.
      addFact(
        facts,
        seen,
        cluster,
        entry,
        spec.field,
        value,
        match.index,
        match[0].length,
        spec.source,
        spec.confidence * baseConfidence,
        spec.evidence,
      );
    }

    // Canas y otros rasgos se guardan como rasgo distintivo además de cabello.
    const feature = SPECIAL_FEATURES.exec(entry.sentence.text);
    SPECIAL_FEATURES.lastIndex = 0;
    if (feature) {
      const featureWord = normalizeName(feature[1] ?? "");
      const isHair = featureWord.includes("cana");
      addFact(
        facts,
        seen,
        cluster,
        entry,
        isHair ? "hair" : "distinguishingFeatures",
        isHair ? "Canas" : capitalize(feature[1] ?? ""),
        feature.index,
        feature[0].length,
        "INFERRED",
        0.68 * baseConfidence,
        isHair ? "Rasgo observado; se interpreta que tiene canas" : "Rasgo distintivo mencionado",
      );
    }
  }

  return facts
    .sort((a, b) => b.confidence - a.confidence || a.sectionOrder - b.sectionOrder)
    .slice(0, 80);
}

interface EventPattern {
  regex: RegExp;
  type: EventType;
  title: (name: string) => string;
}

const WORD_EDGE_START = String.raw`(?<![\p{L}\p{N}])`;
const WORD_EDGE_END = String.raw`(?![\p{L}\p{N}])`;
const wordPattern = (source: string, flags = "iu") =>
  new RegExp(`${WORD_EDGE_START}(?:${source})${WORD_EDGE_END}`, flags);

const EVENT_PATTERNS: EventPattern[] = [
  {
    regex: wordPattern("murió|murio|falleció|fallecio"),
    type: "EVENT",
    title: (name) => `Muerte de ${name}`,
  },
  {
    regex: wordPattern("se casó|se caso|contrajo matrimonio|se divorció|se divorcio"),
    type: "EVENT",
    title: (name) => `Matrimonio o separación de ${name}`,
  },
  {
    regex: wordPattern("viajó|viajo|partió|partio|emigró|emigro|regresó|regreso|huyó|huyo"),
    type: "EVENT",
    title: (name) => `Viaje o regreso de ${name}`,
  },
  {
    regex: wordPattern("decidió|decidio|eligió|eligio|renunció|renuncio"),
    type: "DECISION",
    title: (name) => `Decisión de ${name}`,
  },
  {
    regex: wordPattern(
      "cambió|cambio|aprendió|aprendio|se transformó|se transformo|comenzó a|comenzo a",
    ),
    type: "TRANSFORMATION",
    title: (name) => `Transformación de ${name}`,
  },
  {
    regex: wordPattern(
      "se enfrentó|se enfrento|discutió|discutio|peleó|peleo|mató|mato|traicionó|traiciono",
    ),
    type: "EVENT",
    title: (name) => `Conflicto de ${name}`,
  },
  {
    regex: wordPattern("nació|nacio|creció|crecio|llegó|llego|conoció|conocio"),
    type: "EVENT",
    title: (name) => `Acontecimiento de ${name}`,
  },
];

export function extractEventsForCharacter(cluster: NameCluster): CharacterEventCandidate[] {
  const events: CharacterEventCandidate[] = [];
  const seen = new Set<string>();

  for (const entry of characterSentences(cluster)) {
    for (const pattern of EVENT_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(entry.sentence.text);
      if (!match) continue;

      const key = `${entry.occurrence.sectionId}:${entry.sentence.start}:${pattern.type}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      events.push({
        characterKey: cluster.key,
        characterName: cluster.primaryName,
        type: pattern.type,
        title: pattern.title(cluster.primaryName),
        description: cleanValue(entry.sentence.text, 300),
        excerpt: cleanValue(entry.sentence.text, 240),
        sectionId: entry.occurrence.sectionId,
        sectionTitle: entry.occurrence.sectionTitle,
        sectionOrder: entry.occurrence.sectionOrder,
        offset: entry.sentence.start + match.index,
        confidence: 0.66,
      });
      break;
    }
  }

  return events.sort((a, b) => a.sectionOrder - b.sectionOrder).slice(0, 8);
}
