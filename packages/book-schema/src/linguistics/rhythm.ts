import type { TiptapTextBlock } from "./text";
import { countSpanishWords, splitSpanishSentences } from "./text";

/** Límite defensivo para mantener el análisis síncrono acotado y predecible. */
export const RHYTHM_ANALYSIS_LIMITS = {
  maxChapters: 1_000,
  maxBlocks: 250_000,
  maxTextCodeUnits: 20_000_000,
} as const;

export const RHYTHM_ANALYSIS_VERSION = "1.0.0" as const;

/** Intervalos inclusivos de palabras por párrafo; 0 representa párrafos vacíos. */
export const PARAGRAPH_LENGTH_BUCKETS = [
  { id: "0", label: "0 palabras", min: 0, max: 0 },
  { id: "1-25", label: "1–25 palabras", min: 1, max: 25 },
  { id: "26-50", label: "26–50 palabras", min: 26, max: 50 },
  { id: "51-75", label: "51–75 palabras", min: 51, max: 75 },
  { id: "76-100", label: "76–100 palabras", min: 76, max: 100 },
  { id: "101-150", label: "101–150 palabras", min: 101, max: 150 },
  { id: "151-200", label: "151–200 palabras", min: 151, max: 200 },
  { id: "201+", label: "201 o más palabras", min: 201, max: null },
] as const;

export interface RhythmChapterInput {
  sectionId: string;
  sectionTitle: string;
  contentVersion: number;
  contentHash: string;
  /** Bloques de una sola sección/capítulo, en el orden del documento. */
  blocks: readonly TiptapTextBlock[];
}

export interface RhythmParagraphMetrics {
  paragraphIndex: number;
  /** Offset UTF-16 de ProseMirror, conservado desde los bloques fuente. */
  startOffset: number;
  endOffset: number;
  wordCount: number;
  sentenceCount: number;
}

export interface ParagraphLengthBucket {
  id: (typeof PARAGRAPH_LENGTH_BUCKETS)[number]["id"];
  label: (typeof PARAGRAPH_LENGTH_BUCKETS)[number]["label"];
  min: number;
  max: number | null;
  paragraphCount: number;
}

export interface RhythmChapterMetrics {
  sectionId: string;
  sectionTitle: string;
  contentVersion: number;
  contentHash: string;
  wordCount: number;
  paragraphCount: number;
  sentenceCount: number;
  meanParagraphWords: number | null;
  dialogueWordCount: number;
  dialogueWordPercentage: number | null;
  nonDialogueNarrationWordCount: number;
  nonDialogueNarrationWordPercentage: number | null;
  paragraphs: RhythmParagraphMetrics[];
  paragraphLengthDistribution: ParagraphLengthBucket[];
}

export interface RhythmChapterValue {
  sectionId: string;
  sectionTitle: string;
  contentVersion: number;
  value: number | null;
}

export interface RhythmParagraphValue {
  sectionId: string;
  sectionTitle: string;
  paragraphIndex: number;
  value: number;
}

export interface RhythmDistributionSeries {
  bucketId: ParagraphLengthBucket["id"];
  label: string;
  chapters: Array<{ sectionId: string; sectionTitle: string; paragraphCount: number }>;
}

export interface RhythmAnalysisResult {
  analysisVersion: typeof RHYTHM_ANALYSIS_VERSION;
  coordinateSystem: "prosemirror-utf16";
  note: string;
  chapters: RhythmChapterMetrics[];
  chapterLengthVariation: {
    sectionCount: number;
    meanWords: number;
    standardDeviationWords: number;
    standardDeviationKind: "population";
    /** null si no hay capítulos con palabras (media cero). */
    coefficientOfVariation: number | null;
  };
  series: {
    wordsByChapter: RhythmChapterValue[];
    meanParagraphWordsByChapter: RhythmChapterValue[];
    dialogueWordPercentageByChapter: RhythmChapterValue[];
    nonDialogueNarrationWordPercentageByChapter: RhythmChapterValue[];
    sentencesByParagraph: RhythmParagraphValue[];
    paragraphLengthDistribution: RhythmDistributionSeries[];
  };
}

const RHYTHM_NOTE =
  "Estas métricas describen rasgos formales del texto; no miden tensión ni calidad narrativa. " +
  "El diálogo se cuenta exclusivamente según TiptapTextBlock.isDialogue, sin inferirlo del contenido semántico. " +
  "La extracción existente marca como diálogo un bloque cuyo texto empieza, tras espacios opcionales, " +
  "con raya (—) o semirraya (–), espacios opcionales y un carácter no blanco; la marca puede proceder " +
  "de otra clasificación del caller. Narración no dialogada significa aquí únicamente palabras en bloques " +
  "con isDialogue=false, no una evaluación semántica de narración.";

function roundTo(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return roundTo((numerator / denominator) * 100, 2);
}

function findBucket(wordCount: number): (typeof PARAGRAPH_LENGTH_BUCKETS)[number] {
  return (
    PARAGRAPH_LENGTH_BUCKETS.find(
      (bucket) => wordCount >= bucket.min && (bucket.max === null || wordCount <= bucket.max),
    ) ?? PARAGRAPH_LENGTH_BUCKETS[PARAGRAPH_LENGTH_BUCKETS.length - 1]!
  );
}

function assertWithinLimits(chapters: readonly RhythmChapterInput[]): void {
  if (chapters.length > RHYTHM_ANALYSIS_LIMITS.maxChapters) {
    throw new RangeError(
      `El análisis de ritmo admite hasta ${RHYTHM_ANALYSIS_LIMITS.maxChapters} capítulos.`,
    );
  }

  let blockCount = 0;
  let textCodeUnits = 0;
  for (const chapter of chapters) {
    blockCount += chapter.blocks.length;
    if (blockCount > RHYTHM_ANALYSIS_LIMITS.maxBlocks) {
      throw new RangeError(
        `El análisis de ritmo admite hasta ${RHYTHM_ANALYSIS_LIMITS.maxBlocks} bloques.`,
      );
    }
    for (const block of chapter.blocks) {
      textCodeUnits += block.text.length;
      if (textCodeUnits > RHYTHM_ANALYSIS_LIMITS.maxTextCodeUnits) {
        throw new RangeError(
          `El análisis de ritmo admite hasta ${RHYTHM_ANALYSIS_LIMITS.maxTextCodeUnits} unidades UTF-16 de texto.`,
        );
      }
    }
  }
}

/**
 * Calcula métricas formales deterministas para capítulos ya agrupados por el caller.
 * Los conteos de palabra reutilizan la tokenización española de `text.ts`; los offsets
 * de párrafo siguen siendo offsets UTF-16 del documento ProseMirror original.
 * Superar los límites declarados produce RangeError en vez de resultados parciales.
 */
export function analyzeRhythm(chapters: readonly RhythmChapterInput[]): RhythmAnalysisResult {
  assertWithinLimits(chapters);

  const chapterMetrics: RhythmChapterMetrics[] = chapters.map((chapter) => {
    let wordCount = 0;
    let dialogueWordCount = 0;
    const paragraphMap = new Map<number, RhythmParagraphMetrics>();

    for (const block of chapter.blocks) {
      const blockWordCount = countSpanishWords(block.text);
      wordCount += blockWordCount;
      if (block.isDialogue) dialogueWordCount += blockWordCount;
      if (block.type !== "paragraph") continue;

      const sentenceCount = splitSpanishSentences(block.text).length;
      const existing = paragraphMap.get(block.paragraphIndex);
      if (existing) {
        existing.startOffset = Math.min(existing.startOffset, block.startOffset);
        existing.endOffset = Math.max(existing.endOffset, block.endOffset);
        existing.wordCount += blockWordCount;
        existing.sentenceCount += sentenceCount;
      } else {
        paragraphMap.set(block.paragraphIndex, {
          paragraphIndex: block.paragraphIndex,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          wordCount: blockWordCount,
          sentenceCount,
        });
      }
    }

    const paragraphs = [...paragraphMap.values()];
    const paragraphWordTotal = paragraphs.reduce(
      (total, paragraph) => total + paragraph.wordCount,
      0,
    );
    const bucketCounts = new Map<string, number>(
      PARAGRAPH_LENGTH_BUCKETS.map((bucket) => [bucket.id, 0]),
    );
    for (const paragraph of paragraphs) {
      const bucket = findBucket(paragraph.wordCount);
      bucketCounts.set(bucket.id, (bucketCounts.get(bucket.id) ?? 0) + 1);
    }

    return {
      sectionId: chapter.sectionId,
      sectionTitle: chapter.sectionTitle,
      contentVersion: chapter.contentVersion,
      contentHash: chapter.contentHash,
      wordCount,
      paragraphCount: paragraphs.length,
      sentenceCount: paragraphs.reduce((total, paragraph) => total + paragraph.sentenceCount, 0),
      meanParagraphWords:
        paragraphs.length === 0 ? null : roundTo(paragraphWordTotal / paragraphs.length, 2),
      dialogueWordCount,
      dialogueWordPercentage: percentage(dialogueWordCount, wordCount),
      nonDialogueNarrationWordCount: wordCount - dialogueWordCount,
      nonDialogueNarrationWordPercentage: percentage(wordCount - dialogueWordCount, wordCount),
      paragraphs,
      paragraphLengthDistribution: PARAGRAPH_LENGTH_BUCKETS.map((bucket) => ({
        ...bucket,
        paragraphCount: bucketCounts.get(bucket.id) ?? 0,
      })),
    };
  });

  const sectionCount = chapterMetrics.length;
  const totalWords = chapterMetrics.reduce((total, chapter) => total + chapter.wordCount, 0);
  const meanWords = sectionCount === 0 ? 0 : totalWords / sectionCount;
  const variance =
    sectionCount === 0
      ? 0
      : chapterMetrics.reduce((total, chapter) => total + (chapter.wordCount - meanWords) ** 2, 0) /
        sectionCount;
  const standardDeviationWords = Math.sqrt(variance);

  return {
    analysisVersion: RHYTHM_ANALYSIS_VERSION,
    coordinateSystem: "prosemirror-utf16",
    note: RHYTHM_NOTE,
    chapters: chapterMetrics,
    chapterLengthVariation: {
      sectionCount,
      meanWords: roundTo(meanWords, 2),
      standardDeviationWords: roundTo(standardDeviationWords, 2),
      standardDeviationKind: "population",
      coefficientOfVariation:
        meanWords === 0 ? null : roundTo(standardDeviationWords / meanWords, 4),
    },
    series: {
      wordsByChapter: chapterMetrics.map((chapter) => ({
        sectionId: chapter.sectionId,
        sectionTitle: chapter.sectionTitle,
        contentVersion: chapter.contentVersion,
        value: chapter.wordCount,
      })),
      meanParagraphWordsByChapter: chapterMetrics.map((chapter) => ({
        sectionId: chapter.sectionId,
        sectionTitle: chapter.sectionTitle,
        contentVersion: chapter.contentVersion,
        value: chapter.meanParagraphWords,
      })),
      dialogueWordPercentageByChapter: chapterMetrics.map((chapter) => ({
        sectionId: chapter.sectionId,
        sectionTitle: chapter.sectionTitle,
        contentVersion: chapter.contentVersion,
        value: chapter.dialogueWordPercentage,
      })),
      nonDialogueNarrationWordPercentageByChapter: chapterMetrics.map((chapter) => ({
        sectionId: chapter.sectionId,
        sectionTitle: chapter.sectionTitle,
        contentVersion: chapter.contentVersion,
        value: chapter.nonDialogueNarrationWordPercentage,
      })),
      sentencesByParagraph: chapterMetrics.flatMap((chapter) =>
        chapter.paragraphs.map((paragraph) => ({
          sectionId: chapter.sectionId,
          sectionTitle: chapter.sectionTitle,
          paragraphIndex: paragraph.paragraphIndex,
          value: paragraph.sentenceCount,
        })),
      ),
      paragraphLengthDistribution: PARAGRAPH_LENGTH_BUCKETS.map((bucket) => ({
        bucketId: bucket.id,
        label: bucket.label,
        chapters: chapterMetrics.map((chapter) => ({
          sectionId: chapter.sectionId,
          sectionTitle: chapter.sectionTitle,
          paragraphCount:
            chapter.paragraphLengthDistribution.find((entry) => entry.id === bucket.id)
              ?.paragraphCount ?? 0,
        })),
      })),
    },
  };
}
