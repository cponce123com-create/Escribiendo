import { countWordsInDocument, parseTiptapDocument } from "../tiptap";
import type { TiptapDocument } from "../tiptap";
import { extractTiptapTextBlocks, splitSpanishSentences, tokenizeSpanishText } from "./text";
import type { LinguisticSectionInput } from "./types";

export const READABILITY_SUGGESTED_MINIMUM_WORDS = 100;
export const READABILITY_SUGGESTED_MINIMUM_SENTENCES = 3;

export type ReadabilityInput = TiptapDocument | LinguisticSectionInput;

export interface ReadabilityMetadata {
  language: "es";
  version: 1;
  purpose: "orientative-text-statistics";
  syllableCounting: {
    method: "heuristic-vowel-nuclei";
    approximate: true;
    phonologicalModel: false;
    limitations: string;
  };
  fernandezHuerta: {
    conventionalFormula: "206.84 - 0.60 * P - 1.02 * F";
    conventionalVariables: "P = sílabas por 100 palabras; F = oraciones por 100 palabras";
    scalableEquivalent: "206.84 - 60 * (sílabas / palabras) - 102 * (oraciones / palabras)";
    ambiguity: string;
  };
  szigrisztPazos: {
    formula: "207 - 62.3 * (sílabas / palabras) - (palabras / oraciones)";
    note: string;
  };
  wordCount: "countWordsInDocument (incluye texto de notas al pie según el contrato compartido)";
  paragraphScope: "bloques paragraph editables no vacíos para medias y distribución";
  scoreCaveat: "Las puntuaciones describen rasgos formales del texto; no califican su valor literario.";
}

export interface ReadabilityParagraphStatistics {
  total: number;
  nonEmpty: number;
  empty: number;
  meanWords: number | null;
  medianWords: number | null;
  minWords: number | null;
  maxWords: number | null;
  distribution: {
    "1-19": number;
    "20-49": number;
    "50-99": number;
    "100-199": number;
    "200+": number;
  };
}

export interface ReadabilityMetrics {
  counts: {
    words: number;
    sentences: number;
    syllables: number;
  };
  variables: {
    P: number | null;
    F: number | null;
    syllablesPerWord: number | null;
    wordsPerSentence: number | null;
    syllablesPerSentence: number | null;
  };
  averages: {
    wordsPerSentence: number | null;
    charactersPerWord: number | null;
    syllablesPerWord: number | null;
    syllablesPerSentence: number | null;
  };
  scores: {
    fernandezHuerta: {
      conventional: number | null;
      scalableEquivalent: number | null;
    };
    szigrisztPazos: number | null;
  };
  paragraphs: ReadabilityParagraphStatistics;
  sample: {
    shortText: boolean;
    fewSentences: boolean;
    suggestedMinimumWords: number;
    suggestedMinimumSentences: number;
    guidance: string;
  };
  interpretation: {
    index: "fernandezHuerta.scalableEquivalent";
    band:
      | "muy-accesible"
      | "accesible"
      | "intermedio"
      | "exigente"
      | "muy-exigente"
      | "fuera-de-rango"
      | "insufficient-data";
    guidance: string;
  };
}

export interface ReadabilityDocumentResult {
  documentId: string;
  title: string | null;
  metrics: ReadabilityMetrics;
}

export interface ReadabilityAnalysis {
  metadata: ReadabilityMetadata;
  documents: ReadabilityDocumentResult[];
  aggregate: {
    documentCount: number;
    metrics: ReadabilityMetrics;
  };
}

export const READABILITY_METADATA: ReadabilityMetadata = {
  language: "es",
  version: 1,
  purpose: "orientative-text-statistics",
  syllableCounting: {
    method: "heuristic-vowel-nuclei",
    approximate: true,
    phonologicalModel: false,
    limitations:
      "Estimación ortográfica aproximada: aplica reglas simples a vocales, diptongos, hiatos y diéresis; no resuelve pronunciación, variantes dialectales, sinalefa, nombres propios ni todas las excepciones del español.",
  },
  fernandezHuerta: {
    conventionalFormula: "206.84 - 0.60 * P - 1.02 * F",
    conventionalVariables: "P = sílabas por 100 palabras; F = oraciones por 100 palabras",
    scalableEquivalent: "206.84 - 60 * (sílabas / palabras) - 102 * (oraciones / palabras)",
    ambiguity:
      "La literatura consultada advierte una posible inversión/error en la transcripción convencional. Se exponen la forma convencional y su lectura escalable; con P y F definidos por 100 palabras, ambas son algebraicamente equivalentes. La variante escalable evita ambigüedades de escala.",
  },
  szigrisztPazos: {
    formula: "207 - 62.3 * (sílabas / palabras) - (palabras / oraciones)",
    note: "Versión de muestra grande; el componente palabras/oraciones no se calcula si no hay oraciones.",
  },
  wordCount: "countWordsInDocument (incluye texto de notas al pie según el contrato compartido)",
  paragraphScope: "bloques paragraph editables no vacíos para medias y distribución",
  scoreCaveat:
    "Las puntuaciones describen rasgos formales del texto; no califican su valor literario.",
};

const STRONG_VOWELS = new Set(["a", "e", "o"]);
const WEAK_VOWELS = new Set(["i", "u", "ü"]);

/** Estimación ortográfica de sílabas; no intenta modelar la fonología ni la pronunciación. */
export function countSpanishSyllables(word: string): number {
  const normalized = word.normalize("NFC").toLocaleLowerCase("es");
  const letters = Array.from(normalized);
  const vowels: Array<{ character: string; index: number; accented: boolean }> = [];

  for (let index = 0; index < letters.length; index += 1) {
    const originalCharacter = letters[index] ?? "";
    const character = Array.from(originalCharacter.normalize("NFD"))[0] ?? originalCharacter;
    if (!STRONG_VOWELS.has(character) && !WEAK_VOWELS.has(character)) continue;

    // La u de qu/gu ante e, i no representa un núcleo; ü sí se pronuncia.
    if (
      originalCharacter === "u" &&
      index > 0 &&
      index + 1 < letters.length &&
      (letters[index - 1] === "q" || letters[index - 1] === "g") &&
      (letters[index + 1] === "e" || letters[index + 1] === "i")
    ) {
      continue;
    }
    vowels.push({ character, index, accented: /\u0301/u.test(originalCharacter.normalize("NFD")) });
  }

  if (letters.at(-1) === "y" && vowels.length > 0) {
    vowels.push({ character: "i", index: letters.length - 1, accented: false });
  }
  if (vowels.length === 0) return /[\p{L}\p{N}]/u.test(normalized) ? 1 : 0;

  let syllables = 1;
  for (let index = 1; index < vowels.length; index += 1) {
    const previous = vowels[index - 1];
    const current = vowels[index];
    if (!previous || !current) continue;
    const between = letters.slice(previous.index + 1, current.index);
    const interveningH = between.every((letter) => letter === "h");
    const previousIsStrong = STRONG_VOWELS.has(previous.character);
    const currentIsStrong = STRONG_VOWELS.has(current.character);
    const accentedWeakWithStrong =
      (WEAK_VOWELS.has(previous.character) && previous.accented) ||
      (WEAK_VOWELS.has(current.character) && current.accented);
    const accentedHiatus = accentedWeakWithStrong && previousIsStrong !== currentIsStrong;

    if (!interveningH || (previousIsStrong && currentIsStrong) || accentedHiatus) syllables += 1;
  }
  return syllables;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (sorted.length % 2 === 1) return right ?? null;
  if (left === undefined || right === undefined) return null;
  return round((left + right) / 2);
}

function getBand(score: number | null): ReadabilityMetrics["interpretation"]["band"] {
  if (score === null) return "insufficient-data";
  if (score < 0 || score > 100) return "fuera-de-rango";
  if (score >= 80) return "muy-accesible";
  if (score >= 65) return "accesible";
  if (score >= 50) return "intermedio";
  if (score >= 35) return "exigente";
  return "muy-exigente";
}

function interpret(score: number | null): string {
  const band = getBand(score);
  const notes: Record<ReadabilityMetrics["interpretation"]["band"], string> = {
    "muy-accesible": "El índice orientativo sugiere frases y vocabulario relativamente accesibles.",
    accesible: "El índice orientativo sugiere una lectura generalmente accesible.",
    intermedio: "El índice orientativo queda en un tramo intermedio de legibilidad formal.",
    exigente: "El índice orientativo sugiere una carga formal relativamente exigente.",
    "muy-exigente":
      "El índice orientativo sugiere una carga formal alta; conviene revisar el contexto antes de interpretarlo.",
    "fuera-de-rango":
      "El resultado queda fuera del intervalo orientativo 0–100; no debe extrapolarse.",
    "insufficient-data": "No hay datos suficientes para calcular el índice.",
  };
  return `${notes[band]} No es una valoración de calidad, mérito ni dificultad literaria.`;
}

interface RawDocumentMetrics {
  words: number;
  sentences: number;
  syllables: number;
  paragraphWordCounts: number[];
  emptyParagraphs: number;
  totalWordCharacters: number;
  wordCharacterCount: number;
}

function summarizeParagraphs(
  wordCounts: readonly number[],
  emptyParagraphs: number,
): ReadabilityParagraphStatistics {
  const distribution = { "1-19": 0, "20-49": 0, "50-99": 0, "100-199": 0, "200+": 0 };
  let minWords: number | null = null;
  let maxWords: number | null = null;
  for (const words of wordCounts) {
    if (words <= 19) distribution["1-19"] += 1;
    else if (words <= 49) distribution["20-49"] += 1;
    else if (words <= 99) distribution["50-99"] += 1;
    else if (words <= 199) distribution["100-199"] += 1;
    else distribution["200+"] += 1;
    minWords = minWords === null ? words : Math.min(minWords, words);
    maxWords = maxWords === null ? words : Math.max(maxWords, words);
  }
  return {
    total: wordCounts.length + emptyParagraphs,
    nonEmpty: wordCounts.length,
    empty: emptyParagraphs,
    meanWords: mean(wordCounts),
    medianWords: median(wordCounts),
    minWords,
    maxWords,
    distribution,
  };
}

function metricsFromRaw(raw: RawDocumentMetrics): ReadabilityMetrics {
  const { words, sentences, syllables } = raw;
  const syllablesPerWord = words > 0 ? syllables / words : null;
  const wordsPerSentence = sentences > 0 ? words / sentences : null;
  const syllablesPerSentence = sentences > 0 ? syllables / sentences : null;
  const p = words > 0 ? (syllables / words) * 100 : null;
  const f = words > 0 ? (sentences / words) * 100 : null;
  const conventional = p === null || f === null ? null : 206.84 - 0.6 * p - 1.02 * f;
  const scalable =
    syllablesPerWord === null || words === 0
      ? null
      : 206.84 - 60 * syllablesPerWord - 102 * ((sentences || 0) / words);
  const szigriszt =
    syllablesPerWord === null || wordsPerSentence === null
      ? null
      : 207 - 62.3 * syllablesPerWord - wordsPerSentence;
  const roundedScore = scalable === null ? null : round(scalable);
  const paragraphs = summarizeParagraphs(raw.paragraphWordCounts, raw.emptyParagraphs);
  const shortText = words < READABILITY_SUGGESTED_MINIMUM_WORDS;
  const fewSentences = sentences < READABILITY_SUGGESTED_MINIMUM_SENTENCES;

  return {
    counts: { words, sentences, syllables },
    variables: {
      P: p === null ? null : round(p),
      F: f === null ? null : round(f),
      syllablesPerWord: syllablesPerWord === null ? null : round(syllablesPerWord),
      wordsPerSentence: wordsPerSentence === null ? null : round(wordsPerSentence),
      syllablesPerSentence: syllablesPerSentence === null ? null : round(syllablesPerSentence),
    },
    averages: {
      wordsPerSentence: wordsPerSentence === null ? null : round(wordsPerSentence),
      charactersPerWord:
        raw.wordCharacterCount === 0
          ? null
          : round(raw.totalWordCharacters / raw.wordCharacterCount),
      syllablesPerWord: syllablesPerWord === null ? null : round(syllablesPerWord),
      syllablesPerSentence: syllablesPerSentence === null ? null : round(syllablesPerSentence),
    },
    scores: {
      fernandezHuerta: {
        conventional: conventional === null ? null : round(conventional),
        scalableEquivalent: scalable === null ? null : round(scalable),
      },
      szigrisztPazos: szigriszt === null ? null : round(szigriszt),
    },
    paragraphs,
    sample: {
      shortText,
      fewSentences,
      suggestedMinimumWords: READABILITY_SUGGESTED_MINIMUM_WORDS,
      suggestedMinimumSentences: READABILITY_SUGGESTED_MINIMUM_SENTENCES,
      guidance:
        shortText || fewSentences
          ? "Muestra breve: las fórmulas pueden ser inestables; úsese solo como orientación y, si es posible, analícese un pasaje mayor."
          : "La muestra alcanza los mínimos orientativos configurados; los índices siguen siendo aproximaciones.",
    },
    interpretation: {
      index: "fernandezHuerta.scalableEquivalent",
      band: getBand(roundedScore),
      guidance: interpret(roundedScore),
    },
  };
}

function analyzeDocument(
  input: ReadabilityInput,
  index: number,
): ReadabilityDocumentResult & { raw: RawDocumentMetrics } {
  const isSection = "document" in input && "sectionId" in input;
  const document = parseTiptapDocument(isSection ? input.document : input);
  const blocks = extractTiptapTextBlocks(document);
  const raw: RawDocumentMetrics = {
    words: countWordsInDocument(document),
    sentences: 0,
    syllables: 0,
    paragraphWordCounts: [],
    emptyParagraphs: 0,
    totalWordCharacters: 0,
    wordCharacterCount: 0,
  };

  for (const block of blocks) {
    const tokens = tokenizeSpanishText(block.text);
    for (const token of tokens) {
      raw.syllables += countSpanishSyllables(token.text);
      raw.totalWordCharacters += Array.from(token.text.normalize("NFC")).length;
      raw.wordCharacterCount += 1;
    }
    const sentences = splitSpanishSentences(block.text);
    raw.sentences += sentences.length;
    if (block.type === "paragraph") {
      if (tokens.length === 0) raw.emptyParagraphs += 1;
      else raw.paragraphWordCounts.push(tokens.length);
    }
  }

  const { raw: _raw, ...result } = {
    documentId: isSection ? input.sectionId : `document-${index + 1}`,
    title: isSection ? input.sectionTitle : null,
    metrics: metricsFromRaw(raw),
    raw,
  };
  void _raw;
  return { ...result, raw };
}

function aggregateRaw(
  documents: readonly (ReadabilityDocumentResult & { raw: RawDocumentMetrics })[],
): RawDocumentMetrics {
  const total: RawDocumentMetrics = {
    words: 0,
    sentences: 0,
    syllables: 0,
    paragraphWordCounts: [],
    emptyParagraphs: 0,
    totalWordCharacters: 0,
    wordCharacterCount: 0,
  };
  for (const document of documents) {
    total.words += document.raw.words;
    total.sentences += document.raw.sentences;
    total.syllables += document.raw.syllables;
    total.emptyParagraphs += document.raw.emptyParagraphs;
    total.totalWordCharacters += document.raw.totalWordCharacters;
    total.wordCharacterCount += document.raw.wordCharacterCount;
    for (const words of document.raw.paragraphWordCounts) total.paragraphWordCounts.push(words);
  }
  return total;
}

/** Analiza un documento Tiptap o una sección existente, o una lista de ambos. No muta ni hace I/O. */
export function analyzeReadability(
  input: ReadabilityInput | readonly ReadabilityInput[],
): ReadabilityAnalysis {
  const inputs = Array.isArray(input) ? input : [input];
  const analyzed = inputs.map((item, index) => analyzeDocument(item, index));
  const rawAggregate = aggregateRaw(analyzed);
  const documents = analyzed.map(({ raw: _raw, ...result }) => result);
  return {
    metadata: READABILITY_METADATA,
    documents,
    aggregate: {
      documentCount: documents.length,
      metrics: metricsFromRaw(rawAggregate),
    },
  };
}
