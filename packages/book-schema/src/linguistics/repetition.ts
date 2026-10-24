import type { TiptapDocument } from "../tiptap";
import { extractTiptapTextBlocks } from "./text";
import { tokenizeSpanishText } from "./text";

export interface RepetitionSectionInput {
  bookId: string;
  sectionId: string;
  /** El caller entrega las secciones que pertenecen a cada capítulo. */
  chapterId: string;
  contentVersion: number;
  contentHash: string;
  document: TiptapDocument;
}

export type RepetitionScope = "chapter" | "book";
export type RepetitionKind = "word" | "phrase" | "paragraph-similarity";
export type RepetitionAlgorithm =
  "exact-significant-word-v1" | "exact-phrase-ngram-v1" | "paragraph-tfidf-cosine-v1";

export interface RepetitionAnchor {
  sectionId: string;
  chapterId: string;
  contentVersion: number;
  contentHash: string;
  coordinateSystem: "prosemirror-utf16";
  startOffset: number;
  endOffset: number;
}

/** Observación editorial sugerencial: requiere revisión humana, no es un diagnóstico. */
export interface RepetitionObservation {
  id: string;
  kind: RepetitionKind;
  scope: RepetitionScope;
  algorithm: RepetitionAlgorithm;
  /** Exact matches puntúan 1; la similitud de párrafos es coseno TF-IDF (0–1). */
  score: number;
  matchedText: string;
  first: RepetitionAnchor;
  second: RepetitionAnchor;
  message: string;
  explanation: string;
}

export interface RepetitionAnalysisOptions {
  /** Número mínimo de palabras intermedias para repetir una palabra significativa. */
  minWordDistance?: number;
  /** Palabras intermedias mínimas entre frases idénticas no solapadas. */
  minPhraseGap?: number;
  minPhraseWords?: number;
  maxPhraseWords?: number;
  /** Umbral conservador de coseno TF-IDF para sugerir revisión, entre 0 y 1. */
  paragraphSimilarityThreshold?: number;
  minParagraphWords?: number;
  maxSections?: number;
  maxParagraphs?: number;
  maxTokens?: number;
  maxCandidatePairs?: number;
}

export interface RepetitionAnalysisResult {
  bookId: string | null;
  observations: RepetitionObservation[];
  truncated: boolean;
  limitsHit: string[];
}

interface PreparedToken {
  text: string;
  normalized: string;
  startOffset: number;
  endOffset: number;
  wordIndex: number;
  section: RepetitionSectionInput;
  blockIndex: number;
}

interface PreparedParagraph {
  section: RepetitionSectionInput;
  chapterId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  tokens: ReturnType<typeof tokenizeSpanishText>;
}

interface PreparedBlock {
  section: RepetitionSectionInput;
  type: string;
  text: string;
  startOffset: number;
  tokens: PreparedToken[];
}

interface PhraseOccurrence {
  key: string;
  text: string;
  tokens: PreparedToken[];
  section: RepetitionSectionInput;
}

interface Candidate {
  kind: RepetitionKind;
  scope: RepetitionScope;
  algorithm: RepetitionAlgorithm;
  score: number;
  matchedText: string;
  first: RepetitionAnchor;
  second: RepetitionAnchor;
  explanation: string;
  tieBreaker: string;
}

const SIGNIFICANT_WORDS = new Set([
  "a",
  "al",
  "algo",
  "algunas",
  "algunos",
  "ante",
  "antes",
  "aquel",
  "aquella",
  "aquellas",
  "aquello",
  "aquellos",
  "aquí",
  "así",
  "aun",
  "aunque",
  "bajo",
  "bien",
  "cada",
  "casi",
  "como",
  "con",
  "contra",
  "cual",
  "cuales",
  "cuando",
  "cuanta",
  "cuantas",
  "cuanto",
  "cuantos",
  "de",
  "del",
  "desde",
  "donde",
  "dos",
  "durante",
  "e",
  "el",
  "ella",
  "ellas",
  "ello",
  "ellos",
  "en",
  "entre",
  "era",
  "eran",
  "es",
  "esa",
  "esas",
  "ese",
  "eso",
  "esos",
  "esta",
  "estaba",
  "estaban",
  "estado",
  "estamos",
  "están",
  "estar",
  "estas",
  "este",
  "esto",
  "estos",
  "fue",
  "fueron",
  "ha",
  "había",
  "habían",
  "han",
  "hasta",
  "hay",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "más",
  "me",
  "menos",
  "mi",
  "mis",
  "mientras",
  "muy",
  "nada",
  "ni",
  "no",
  "nos",
  "nuestra",
  "nuestras",
  "nuestro",
  "nuestros",
  "o",
  "os",
  "otra",
  "otras",
  "otro",
  "otros",
  "para",
  "pero",
  "poco",
  "por",
  "porque",
  "que",
  "quien",
  "quienes",
  "se",
  "sea",
  "ser",
  "si",
  "sin",
  "sobre",
  "su",
  "sus",
  "también",
  "te",
  "tiene",
  "tienen",
  "todo",
  "todos",
  "tras",
  "tu",
  "tus",
  "un",
  "una",
  "unas",
  "uno",
  "unos",
  "usted",
  "ustedes",
  "y",
  "ya",
]);

const HARD_LIMITS = {
  maxSections: 500,
  maxParagraphs: 5_000,
  maxTokens: 100_000,
  maxCandidatePairs: 20_000,
} as const;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  ceiling: number,
  floor = 1,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(ceiling, Math.max(floor, Math.floor(value)));
}

function isSignificant(word: string): boolean {
  return word.length >= 3 && /\p{L}/u.test(word) && !SIGNIFICANT_WORDS.has(word);
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function anchor(
  section: RepetitionSectionInput,
  startOffset: number,
  endOffset: number,
): RepetitionAnchor {
  return {
    sectionId: section.sectionId,
    chapterId: section.chapterId,
    contentVersion: section.contentVersion,
    contentHash: section.contentHash,
    coordinateSystem: "prosemirror-utf16",
    startOffset,
    endOffset,
  };
}

function makeCandidate(
  kind: RepetitionKind,
  scope: RepetitionScope,
  algorithm: RepetitionAlgorithm,
  score: number,
  matchedText: string,
  firstSection: RepetitionSectionInput,
  firstStart: number,
  firstEnd: number,
  secondSection: RepetitionSectionInput,
  secondStart: number,
  secondEnd: number,
  explanation: string,
  tieBreaker: string,
): Candidate {
  const first = anchor(firstSection, firstStart, firstEnd);
  const second = anchor(secondSection, secondStart, secondEnd);
  const identity = [
    firstSection.bookId,
    kind,
    algorithm,
    first.sectionId,
    first.chapterId,
    first.startOffset,
    first.endOffset,
    second.sectionId,
    second.chapterId,
    second.startOffset,
    second.endOffset,
    tieBreaker,
  ].join("\u001f");
  return {
    kind,
    scope,
    algorithm,
    score,
    matchedText,
    first,
    second,
    explanation,
    tieBreaker: identity,
  };
}

function toObservation(candidate: Candidate): RepetitionObservation {
  const scopeText = candidate.scope === "chapter" ? "en este capítulo" : "en el libro";
  const message =
    candidate.kind === "paragraph-similarity"
      ? `Estos párrafos presentan similitud textual ${scopeText}; conviene revisarlos.`
      : `Se repite ${candidate.kind === "word" ? "una palabra significativa" : "una frase"} ${scopeText}; conviene revisar si es intencional.`;
  return {
    id: `rep_v1_${fnv1a64(candidate.tieBreaker)}`,
    kind: candidate.kind,
    scope: candidate.scope,
    algorithm: candidate.algorithm,
    score: candidate.score,
    matchedText: candidate.matchedText,
    first: candidate.first,
    second: candidate.second,
    message,
    explanation: candidate.explanation,
  };
}

function scopeFor(first: RepetitionSectionInput, second: RepetitionSectionInput): RepetitionScope {
  return first.chapterId === second.chapterId ? "chapter" : "book";
}

function rangesOverlap(a: RepetitionAnchor, b: RepetitionAnchor): boolean {
  return a.sectionId === b.sectionId && a.startOffset < b.endOffset && b.startOffset < a.endOffset;
}

/**
 * Analiza repeticiones deterministas en documentos Tiptap. Los offsets se extraen
 * del documento fuente (UTF-16 ProseMirror) y no del texto normalizado.
 * La similitud de párrafos es únicamente similitud de superficie léxica: nunca
 * prueba que dos pasajes sean redundantes semánticamente.
 */
export function analyzeRepetition(
  sections: readonly RepetitionSectionInput[],
  options: RepetitionAnalysisOptions = {},
): RepetitionAnalysisResult {
  const maxSections = boundedInteger(options.maxSections, 200, HARD_LIMITS.maxSections);
  const maxParagraphs = boundedInteger(options.maxParagraphs, 2_000, HARD_LIMITS.maxParagraphs);
  const maxTokens = boundedInteger(options.maxTokens, 50_000, HARD_LIMITS.maxTokens);
  const maxCandidatePairs = boundedInteger(
    options.maxCandidatePairs,
    10_000,
    HARD_LIMITS.maxCandidatePairs,
  );
  const minWordDistance = boundedInteger(options.minWordDistance, 8, 10_000, 0);
  const minPhraseGap = boundedInteger(options.minPhraseGap, 3, 10_000, 0);
  const minPhraseWords = boundedInteger(options.minPhraseWords, 3, 6, 2);
  const maxPhraseWords = Math.max(minPhraseWords, boundedInteger(options.maxPhraseWords, 5, 8, 2));
  const minParagraphWords = boundedInteger(options.minParagraphWords, 8, 100, 3);
  const threshold = Number.isFinite(options.paragraphSimilarityThreshold)
    ? Math.min(1, Math.max(0, options.paragraphSimilarityThreshold ?? 0.88))
    : 0.88;
  const limitsHit = new Set<string>();
  const candidates: Candidate[] = [];
  const selectedSections = sections.slice(0, maxSections);
  if (sections.length > selectedSections.length) limitsHit.add("maxSections");
  const bookId = selectedSections[0]?.bookId ?? null;
  const consistentSections = selectedSections.filter((section) => section.bookId === bookId);
  if (consistentSections.length !== selectedSections.length) limitsHit.add("mixedBookIds");

  const allTokens: PreparedToken[] = [];
  const paragraphs: PreparedParagraph[] = [];
  const preparedBlocks: PreparedBlock[] = [];
  let globalWordIndex = 0;
  let totalTokens = 0;
  let paragraphLimitHit = false;
  let tokenLimitHit = false;

  for (const section of consistentSections) {
    const blocks = extractTiptapTextBlocks(section.document);
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      if (!block) continue;
      if (totalTokens >= maxTokens) {
        tokenLimitHit = true;
        break;
      }
      const blockTokens = tokenizeSpanishText(block.text, block.startOffset);
      const acceptedTokens = blockTokens.slice(0, maxTokens - totalTokens);
      if (acceptedTokens.length < blockTokens.length) tokenLimitHit = true;
      const prepared = acceptedTokens.map((token) => ({
        ...token,
        wordIndex: globalWordIndex++,
        section,
        blockIndex,
      }));
      totalTokens += prepared.length;
      allTokens.push(...prepared);
      preparedBlocks.push({
        section,
        type: block.type,
        text: block.text,
        startOffset: block.startOffset,
        tokens: prepared,
      });

      if (block.type !== "paragraph") continue;
      if (paragraphs.length >= maxParagraphs) {
        paragraphLimitHit = true;
        continue;
      }
      paragraphs.push({
        section,
        chapterId: section.chapterId,
        text: block.text,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        tokens: acceptedTokens,
      });
    }
    if (tokenLimitHit) break;
  }
  if (paragraphLimitHit) limitsHit.add("maxParagraphs");
  if (tokenLimitHit) limitsHit.add("maxTokens");

  const addCandidate = (candidate: Candidate): boolean => {
    if (candidates.length >= maxCandidatePairs) {
      limitsHit.add("maxCandidatePairs");
      return false;
    }
    candidates.push(candidate);
    return true;
  };

  // Palabras significativas idénticas: un único par previo útil por ocurrencia
  // y alcance, evitando el producto cartesiano de términos frecuentes.
  const byWord = new Map<string, PreparedToken[]>();
  for (const token of allTokens) {
    if (!isSignificant(token.normalized)) continue;
    const occurrences = byWord.get(token.normalized) ?? [];
    occurrences.push(token);
    byWord.set(token.normalized, occurrences);
  }
  for (const [word, occurrences] of byWord) {
    for (let currentIndex = 1; currentIndex < occurrences.length; currentIndex += 1) {
      const current = occurrences[currentIndex];
      if (!current) continue;
      let sameChapterAdded = false;
      let crossChapterAdded = false;
      for (
        let previousIndex = currentIndex - 1;
        previousIndex >= 0 && currentIndex - previousIndex <= 32;
        previousIndex -= 1
      ) {
        const previous = occurrences[previousIndex];
        if (!previous || current.wordIndex - previous.wordIndex - 1 < minWordDistance) continue;
        const crossChapter = previous.section.chapterId !== current.section.chapterId;
        if (crossChapter ? crossChapterAdded : sameChapterAdded) continue;
        const scope = crossChapter ? "book" : "chapter";
        const candidate = makeCandidate(
          "word",
          scope,
          "exact-significant-word-v1",
          1,
          current.text,
          previous.section,
          previous.startOffset,
          previous.endOffset,
          current.section,
          current.startOffset,
          current.endOffset,
          "Coinciden exactamente las formas normalizadas de una palabra significativa, separadas por la distancia mínima configurada.",
          word,
        );
        if (!addCandidate(candidate)) break;
        if (crossChapter) crossChapterAdded = true;
        else sameChapterAdded = true;
        if (sameChapterAdded && crossChapterAdded) break;
      }
      if (candidates.length >= maxCandidatePairs) break;
    }
    if (candidates.length >= maxCandidatePairs) break;
  }

  // N-gramas exactos acotados; exige contenido léxico y elige primero las frases
  // más largas para que variantes solapadas no multipliquen las sugerencias.
  const phrases = new Map<string, PhraseOccurrence[]>();
  for (const block of preparedBlocks) {
    if (block.type !== "paragraph" && block.type !== "heading") continue;
    const tokens = block.tokens;
    for (let length = minPhraseWords; length <= maxPhraseWords; length += 1) {
      for (let start = 0; start + length <= tokens.length; start += 1) {
        const slice = tokens.slice(start, start + length);
        const significantCount = slice.filter((token) => isSignificant(token.normalized)).length;
        if (significantCount < 2 || significantCount / length < 0.5) continue;
        const key = slice.map((token) => token.normalized).join(" ");
        const list = phrases.get(key) ?? [];
        if (list.length >= 80) continue;
        const firstToken = slice[0];
        const lastToken = slice.at(-1);
        if (!firstToken || !lastToken) continue;
        list.push({
          key,
          text: block.text.slice(
            firstToken.startOffset - block.startOffset,
            lastToken.endOffset - block.startOffset,
          ),
          tokens: slice,
          section: block.section,
        });
        phrases.set(key, list);
      }
    }
  }
  const phraseCandidates: Candidate[] = [];
  const phraseEntries = [...phrases.entries()].sort(
    ([left], [right]) =>
      right.split(" ").length - left.split(" ").length || left.localeCompare(right),
  );
  const phraseCandidateLimit = Math.max(0, maxCandidatePairs - candidates.length);
  phraseSearch: for (const [key, occurrences] of phraseEntries) {
    for (let currentIndex = 1; currentIndex < occurrences.length; currentIndex += 1) {
      const current = occurrences[currentIndex];
      if (!current) continue;
      for (
        let previousIndex = currentIndex - 1;
        previousIndex >= Math.max(0, currentIndex - 16);
        previousIndex -= 1
      ) {
        const previous = occurrences[previousIndex];
        const previousLast = previous?.tokens.at(-1);
        const currentFirst = current.tokens[0];
        const currentLast = current.tokens.at(-1);
        const previousFirst = previous?.tokens[0];
        if (!previous || !previousLast || !previousFirst || !currentFirst || !currentLast) continue;
        if (
          previous.section.sectionId === current.section.sectionId &&
          previousLast.endOffset > currentFirst.startOffset
        )
          continue;
        const intervening =
          currentFirst.wordIndex >= previousLast.wordIndex
            ? currentFirst.wordIndex - previousLast.wordIndex - 1
            : Number.MAX_SAFE_INTEGER;
        // Los índices ordinales son globales para todos los bloques procesados.
        const gap =
          previous.section.sectionId === current.section.sectionId
            ? Math.max(0, intervening)
            : minPhraseGap;
        if (gap < minPhraseGap) continue;
        const candidate = makeCandidate(
          "phrase",
          scopeFor(previous.section, current.section),
          "exact-phrase-ngram-v1",
          1,
          previous.text,
          previous.section,
          previousFirst.startOffset,
          previousLast.endOffset,
          current.section,
          currentFirst.startOffset,
          currentLast.endOffset,
          "N-grama de palabras coincidente tras normalización NFC y minúsculas; se exigen al menos dos palabras léxicas para excluir frases funcionales.",
          key,
        );
        phraseCandidates.push(candidate);
        if (phraseCandidates.length >= phraseCandidateLimit) {
          limitsHit.add("maxCandidatePairs");
          break phraseSearch;
        }
        break;
      }
    }
  }
  phraseCandidates.sort((a, b) => {
    const wordsA = a.matchedText.split(/\s+/u).length;
    const wordsB = b.matchedText.split(/\s+/u).length;
    return wordsB - wordsA || a.tieBreaker.localeCompare(b.tieBreaker);
  });
  const reservedPhraseRanges: RepetitionAnchor[] = [];
  for (const candidate of phraseCandidates) {
    if (
      reservedPhraseRanges.some(
        (range) => rangesOverlap(range, candidate.first) || rangesOverlap(range, candidate.second),
      )
    )
      continue;
    if (!addCandidate(candidate)) break;
    reservedPhraseRanges.push(candidate.first, candidate.second);
  }

  // Similitud textual de párrafos. Un índice invertido de unigramas y bigramas
  // limita la comparación a candidatos con rasgos compartidos; cada posting se
  // acota, evitando O(P²) aun en colecciones con vocabulario muy repetido.
  const eligibleParagraphs = paragraphs.filter(
    (paragraph) => paragraph.tokens.length >= minParagraphWords,
  );
  const documentFrequency = new Map<string, number>();
  const featuresByParagraph: Map<string, number>[] = [];
  for (const paragraph of eligibleParagraphs) {
    const features = new Map<string, number>();
    const words = paragraph.tokens.map((token) => token.normalized);
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      if (!word || !isSignificant(word)) continue;
      const unigram = `w:${word}`;
      features.set(unigram, (features.get(unigram) ?? 0) + 1);
      const next = words[index + 1];
      if (next && (isSignificant(next) || isSignificant(word))) {
        const bigram = `b:${word} ${next}`;
        features.set(bigram, (features.get(bigram) ?? 0) + 1);
      }
    }
    for (const feature of features.keys())
      documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
    featuresByParagraph.push(features);
  }
  const weightedVectors: Map<string, number>[] = [];
  const vectorNorms: number[] = [];
  for (const features of featuresByParagraph) {
    const weighted = new Map<string, number>();
    let normSquared = 0;
    for (const [feature, termFrequency] of features) {
      const idf = Math.log(
        1 + eligibleParagraphs.length / (1 + (documentFrequency.get(feature) ?? 0)),
      );
      const weight = (1 + Math.log(termFrequency)) * idf;
      weighted.set(feature, weight);
      normSquared += weight * weight;
    }
    weightedVectors.push(weighted);
    vectorNorms.push(Math.sqrt(normSquared));
  }

  const postings = new Map<string, number[]>();
  for (let index = 0; index < featuresByParagraph.length; index += 1) {
    const features = featuresByParagraph[index];
    if (!features) continue;
    for (const feature of features.keys()) {
      const posting = postings.get(feature) ?? [];
      posting.push(index);
      postings.set(feature, posting);
    }
  }
  const paragraphPairs = new Set<string>();
  const postingCap = 64;
  outer: for (const posting of postings.values()) {
    const boundedPosting = posting.length > postingCap ? posting.slice(-postingCap) : posting;
    for (let currentPos = 1; currentPos < boundedPosting.length; currentPos += 1) {
      const current = boundedPosting[currentPos];
      if (current === undefined) continue;
      for (
        let previousPos = Math.max(0, currentPos - 16);
        previousPos < currentPos;
        previousPos += 1
      ) {
        const previous = boundedPosting[previousPos];
        if (previous === undefined || previous === current) continue;
        const left = eligibleParagraphs[previous];
        const right = eligibleParagraphs[current];
        if (
          !left ||
          !right ||
          (left.section.sectionId === right.section.sectionId &&
            left.startOffset === right.startOffset)
        )
          continue;
        const pairKey = `${previous}:${current}`;
        paragraphPairs.add(pairKey);
        if (
          paragraphPairs.size >= maxCandidatePairs ||
          candidates.length + paragraphPairs.size >= maxCandidatePairs
        ) {
          limitsHit.add("maxCandidatePairs");
          break outer;
        }
      }
    }
  }
  const rankedParagraphCandidates: Candidate[] = [];
  for (const pairKey of paragraphPairs) {
    const [firstIndexText, secondIndexText] = pairKey.split(":");
    const firstIndex = Number(firstIndexText);
    const secondIndex = Number(secondIndexText);
    const firstParagraph = eligibleParagraphs[firstIndex];
    const secondParagraph = eligibleParagraphs[secondIndex];
    if (!firstParagraph || !secondParagraph) continue;
    const scope = scopeFor(firstParagraph.section, secondParagraph.section);
    const firstVector = weightedVectors[firstIndex];
    const secondVector = weightedVectors[secondIndex];
    const firstNorm = vectorNorms[firstIndex] ?? 0;
    const secondNorm = vectorNorms[secondIndex] ?? 0;
    if (!firstVector || !secondVector || firstNorm === 0 || secondNorm === 0) continue;
    let dotProduct = 0;
    const [smallVector, largeVector] =
      firstVector.size <= secondVector.size
        ? [firstVector, secondVector]
        : [secondVector, firstVector];
    for (const [feature, weight] of smallVector)
      dotProduct += weight * (largeVector.get(feature) ?? 0);
    const score = dotProduct / (firstNorm * secondNorm);
    if (score < threshold) continue;
    const explanation =
      "Coseno TF-IDF sobre unigramas y bigramas compartidos. Mide similitud textual y no demuestra redundancia semántica; comprueba el contexto antes de editar.";
    rankedParagraphCandidates.push(
      makeCandidate(
        "paragraph-similarity",
        scope,
        "paragraph-tfidf-cosine-v1",
        Number(score.toFixed(4)),
        firstParagraph.text,
        firstParagraph.section,
        firstParagraph.startOffset,
        firstParagraph.endOffset,
        secondParagraph.section,
        secondParagraph.startOffset,
        secondParagraph.endOffset,
        explanation,
        `${firstParagraph.section.sectionId}:${firstParagraph.startOffset}|${secondParagraph.section.sectionId}:${secondParagraph.startOffset}`,
      ),
    );
  }
  rankedParagraphCandidates.sort(
    (a, b) => b.score - a.score || a.tieBreaker.localeCompare(b.tieBreaker),
  );
  for (const candidate of rankedParagraphCandidates) {
    if (!addCandidate(candidate)) break;
  }

  candidates.sort(
    (a, b) =>
      a.first.sectionId.localeCompare(b.first.sectionId) ||
      a.first.startOffset - b.first.startOffset ||
      a.second.sectionId.localeCompare(b.second.sectionId) ||
      a.second.startOffset - b.second.startOffset ||
      a.algorithm.localeCompare(b.algorithm),
  );
  return {
    bookId,
    observations: candidates.map(toObservation),
    truncated: limitsHit.size > 0,
    limitsHit: [...limitsHit],
  };
}
