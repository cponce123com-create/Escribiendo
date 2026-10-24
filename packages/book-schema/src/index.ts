export {
  BOOK_SECTION_TYPES,
  CHAPTER_LIKE_SECTION_TYPES,
  bookMetadataSchema,
  type BookMetadataInput,
  type BookSectionType,
} from "./metadata";
export {
  diffWords,
  summarizeDiff,
  type DiffOperation,
  type DiffSegment,
  type DiffSummary,
} from "./diff";
export {
  MAX_DOCUMENT_BYTES,
  MAX_FOOTNOTE_LENGTH,
  MAX_NODE_COUNT,
  TiptapValidationError,
  assertDocumentLimits,
  countWords,
  countWordsInDocument,
  emptyTiptapDocument,
  extractPlainText,
  parseTiptapDocument,
  tiptapDocumentSchema,
  type TiptapDocument,
  type TiptapMark,
  type TiptapNode,
} from "./tiptap";
export {
  analyzeBookLinguistically,
  isRuleFinding,
  LinguisticAnalysisEngine,
} from "./linguistics/engine";
export {
  countSpanishWords,
  extractTiptapTextBlocks,
  normalizeSpanishForComparison,
  normalizeSpanishText,
  splitSpanishSentences,
  tokenizeSpanishText,
  type SpanishSentence,
  type TiptapTextBlock,
  type TiptapTextBlockType,
} from "./linguistics/text";
export {
  NARRATIVE_FACT_RULE_VERSION,
  detectNarrativeInconsistencies,
  extractNarrativeFacts,
} from "./linguistics/continuity";
export type {
  AnalyzeNarrativeSectionInput,
  NarrativeEntityCandidate,
  NarrativeEvidenceMode,
  NarrativeFactEvidence,
  NarrativeFactType,
  NarrativeFindingType,
  NarrativeInconsistency,
} from "./linguistics/continuity";
export type {
  AnalyzeBatchesOptions,
  EditorialFinding,
  EditorialFindingCategory,
  EditorialFindingSeverity,
  EditorialFindingStatus,
  EditorialRule,
  EditorialRuleFinding,
  LinguisticAnalysisError,
  LinguisticAnalysisOptions,
  LinguisticAnalysisResult,
  LinguisticRuleContext,
  LinguisticRulePreferences,
  LinguisticSectionInput,
  LinguisticSectionResult,
  LinguisticSectionStats,
  LinguisticSentence,
  LinguisticToken,
} from "./linguistics/types";
export { createSpanishStyleRules } from "./linguistics/style-rules";
export type {
  SpanishStyleRuleThresholds,
  SpanishStyleRulesOptions,
} from "./linguistics/style-rules";
export { analyzeRepetition } from "./linguistics/repetition";
export type {
  RepetitionAnalysisOptions,
  RepetitionAnalysisResult,
  RepetitionAnchor,
  RepetitionKind,
  RepetitionObservation,
  RepetitionScope,
  RepetitionSectionInput,
} from "./linguistics/repetition";
export {
  analyzeReadability,
  countSpanishSyllables,
  READABILITY_METADATA,
  READABILITY_SUGGESTED_MINIMUM_SENTENCES,
  READABILITY_SUGGESTED_MINIMUM_WORDS,
} from "./linguistics/readability";
export type {
  ReadabilityAnalysis,
  ReadabilityDocumentResult,
  ReadabilityInput,
  ReadabilityMetadata,
  ReadabilityMetrics,
  ReadabilityParagraphStatistics,
} from "./linguistics/readability";
export {
  analyzeRhythm,
  PARAGRAPH_LENGTH_BUCKETS,
  RHYTHM_ANALYSIS_LIMITS,
  RHYTHM_ANALYSIS_VERSION,
} from "./linguistics/rhythm";
export type {
  ParagraphLengthBucket,
  RhythmAnalysisResult,
  RhythmChapterInput,
  RhythmChapterMetrics,
  RhythmChapterValue,
  RhythmDistributionSeries,
  RhythmParagraphMetrics,
  RhythmParagraphValue,
} from "./linguistics/rhythm";
