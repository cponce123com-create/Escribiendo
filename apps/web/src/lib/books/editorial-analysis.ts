import "server-only";
import { loadLaboratoryReview, reviewStatusFor } from "./laboratory-review";
import { canPerform } from "./permissions";
import { createHash } from "node:crypto";
import type { Prisma } from "@escribiendo/database";
import {
  disabledStyleRules,
  selectAnalysisSections,
  NARRATIVE_ANALYSIS_TYPES,
  type BookAnalysisOptions,
} from "./analysis-options";
import {
  analyzeRepetition,
  analyzeReadability,
  analyzeRhythm,
  createSpanishStyleRules,
  extractTiptapTextBlocks,
  LinguisticAnalysisEngine,
  parseTiptapDocument,
  type BookSectionType,
  type LinguisticSectionInput,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import type { SessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getBook, getSectionTree } from "@/lib/books/queries";
import { flattenSectionTree } from "@/lib/books/section-tree";
import {
  buildRhythmChapterInputs,
  mapEditorialSectionsToChapters,
} from "@/lib/books/editorial-analysis-structure";
import type {
  AnalysisTarget,
  BookAnalysisDashboardProps,
  ReadabilityAnalysisItem,
  RepetitionAnalysisItem,
  RhythmAnalysisItem,
  StyleAnalysisItem,
} from "@/components/books/book-analysis-dashboard";

const MAX_ANALYSIS_SECTIONS = 120;
const MAX_TOTAL_DOCUMENT_BYTES = 16_000_000;
const MAX_TOTAL_BLOCKS = 25_000;
const MAX_FINDINGS_PER_SECTION = 80;
const MAX_VISIBLE_OBSERVATIONS = 100;
// Caché acotada por proceso: no retiene documentos; cada petición autoriza y verifica hash.
const editorialEngine = new LinguisticAnalysisEngine({ maxCachedSections: 240 });

interface AnalysisSection {
  id: string;
  title: string;
  type: string;
  version: number;
  chapterId: string;
  document: TiptapDocument;
  blocks: ReturnType<typeof extractTiptapTextBlocks>;
  contentHash: string;
}

function safeDocument(value: unknown): TiptapDocument | null {
  try {
    return parseTiptapDocument(value);
  } catch {
    return null;
  }
}

function createContentHash(document: TiptapDocument): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}

function mapAnchor(
  anchor: {
    sectionId: string;
    contentVersion: number;
    startOffset: number;
    endOffset: number;
  },
  titleBySectionId: ReadonlyMap<string, string>,
): AnalysisTarget {
  return {
    sectionId: anchor.sectionId,
    sectionTitle: titleBySectionId.get(anchor.sectionId) ?? "Sección",
    contentVersion: anchor.contentVersion,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
  };
}

function mapStyleFinding(
  finding: Awaited<
    ReturnType<LinguisticAnalysisEngine["analyzeBookInBatches"]>
  >["findings"][number],
  sectionTitle: string,
): StyleAnalysisItem {
  return {
    id: finding.id,
    sectionId: finding.sectionId,
    sectionTitle,
    contentVersion: finding.contentVersion,
    startOffset: finding.startOffset,
    endOffset: finding.endOffset,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    message: finding.message,
    explanation: finding.explanation,
    matchedText: finding.matchedText,
    suggestions: finding.suggestions,
  };
}

function mapRepetitionFinding(
  finding: ReturnType<typeof analyzeRepetition>["observations"][number],
  titleBySectionId: ReadonlyMap<string, string>,
): RepetitionAnalysisItem {
  return {
    id: finding.id,
    kind: finding.kind,
    scope: finding.scope,
    algorithm: finding.algorithm,
    score: finding.score,
    matchedText:
      finding.matchedText.length > 240
        ? `${finding.matchedText.slice(0, 237)}…`
        : finding.matchedText,
    message: finding.message,
    explanation: finding.explanation,
    first: mapAnchor(finding.first, titleBySectionId),
    second: mapAnchor(finding.second, titleBySectionId),
  };
}

function mapReadability(
  documentResult: ReturnType<typeof analyzeReadability>["documents"][number],
): ReadabilityAnalysisItem {
  const { metrics } = documentResult;
  return {
    sectionId: documentResult.documentId,
    sectionTitle: documentResult.title ?? "Sección",
    wordCount: metrics.counts.words,
    sentenceCount: metrics.counts.sentences,
    syllableCount: metrics.counts.syllables,
    paragraphCount: metrics.paragraphs.total,
    meanWordsPerSentence: metrics.averages.wordsPerSentence,
    meanCharactersPerWord: metrics.averages.charactersPerWord,
    fernandezHuerta: metrics.scores.fernandezHuerta.scalableEquivalent,
    szigrisztPazos: metrics.scores.szigrisztPazos,
    shortSample: metrics.sample.shortText || metrics.sample.fewSentences,
    paragraphDistribution: metrics.paragraphs.distribution,
  };
}

function mapRhythm(
  chapter: ReturnType<typeof analyzeRhythm>["chapters"][number],
): RhythmAnalysisItem {
  return {
    sectionId: chapter.sectionId,
    sectionTitle: chapter.sectionTitle,
    wordCount: chapter.wordCount,
    paragraphCount: chapter.paragraphCount,
    sentenceCount: chapter.sentenceCount,
    meanParagraphWords: chapter.meanParagraphWords,
    dialogueWordPercentage: chapter.dialogueWordPercentage,
    nonDialogueNarrationWordPercentage: chapter.nonDialogueNarrationWordPercentage,
    paragraphLengthDistribution: chapter.paragraphLengthDistribution.map(
      ({ label, paragraphCount }) => ({
        label,
        paragraphCount,
      }),
    ),
  };
}

/**
 * Calcula métricas de forma local en el servidor para un libro visible en el
 * espacio de trabajo de la sesión. No persiste texto ni hallazgos.
 */
export async function analyzeBookEditorially(
  session: SessionContext,
  bookId: string,
  options: BookAnalysisOptions = {},
): Promise<BookAnalysisDashboardProps | null> {
  const book = await getBook(session, bookId);
  if (!book) return null;

  const review = await loadLaboratoryReview(session, bookId);
  const storedRules = Array.isArray(review?.disabledRules)
    ? review.disabledRules.filter((value): value is string => typeof value === "string")
    : [];
  const configuredRules = options.disabledRules ?? storedRules;
  const tree = await getSectionTree(session, bookId);
  const selectedNodes = selectAnalysisSections(tree, options.sectionId);
  if (!selectedNodes) return null;
  const selectedIds = selectedNodes.slice(0, MAX_ANALYSIS_SECTIONS).map((node) => node.id);
  const narrativeWhere: Prisma.BookSectionWhereInput = {
    bookId,
    deletedAt: null,
    id: { in: selectedIds },
    type: { in: [...NARRATIVE_ANALYSIS_TYPES] as BookSectionType[] },
    book: { workspaceId: session.workspace.id, deletedAt: null },
  };
  const rows = selectedIds.length
    ? await prisma.bookSection.findMany({
        where: narrativeWhere,
        take: MAX_ANALYSIS_SECTIONS,
        select: { id: true, type: true, title: true, version: true, content: true },
      })
    : [];
  const narrativeSectionCount = selectedNodes.length;

  const chapterBySection = mapEditorialSectionsToChapters(tree);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const orderedNarrativeNodes = selectedNodes.filter((node) => rowById.has(node.id));
  const analysisSections: AnalysisSection[] = [];
  let totalDocumentBytes = 0;
  let totalBlocks = 0;
  let omittedSections = Math.max(0, narrativeSectionCount - rows.length);

  for (const node of orderedNarrativeNodes) {
    const row = rowById.get(node.id);
    if (!row) continue;

    let serializedContent: string;
    try {
      serializedContent = JSON.stringify(row.content);
    } catch {
      omittedSections += 1;
      continue;
    }

    const contentBytes = Buffer.byteLength(serializedContent, "utf8");
    if (
      contentBytes > MAX_TOTAL_DOCUMENT_BYTES ||
      totalDocumentBytes + contentBytes > MAX_TOTAL_DOCUMENT_BYTES
    ) {
      omittedSections += 1;
      continue;
    }

    const document = safeDocument(row.content);
    if (!document) {
      omittedSections += 1;
      continue;
    }

    const blocks = extractTiptapTextBlocks(document);
    if (totalBlocks + blocks.length > MAX_TOTAL_BLOCKS) {
      omittedSections += 1;
      continue;
    }

    totalDocumentBytes += contentBytes;
    totalBlocks += blocks.length;
    analysisSections.push({
      id: row.id,
      title: row.title,
      type: row.type,
      version: row.version,
      chapterId: chapterBySection.get(row.id) ?? row.id,
      document,
      blocks,
      contentHash: createContentHash(document),
    });
  }

  omittedSections += Math.max(0, rows.length - orderedNarrativeNodes.length);
  const titleBySectionId = new Map(analysisSections.map((section) => [section.id, section.title]));
  const linguisticInputs: LinguisticSectionInput[] = analysisSections.map((section) => ({
    bookId,
    sectionId: section.id,
    sectionTitle: section.title,
    sectionType: section.type as BookSectionType,
    contentVersion: section.version,
    contentHash: section.contentHash,
    document: section.document,
  }));

  const styleResult = await editorialEngine.analyzeBookInBatches(bookId, linguisticInputs, {
    rules: createSpanishStyleRules(),
    preferences: {
      enabledByRuleId: Object.fromEntries(
        disabledStyleRules([...configuredRules]).map((id) => [id, false]),
      ),
    },
    maxFindingsPerSection: MAX_FINDINGS_PER_SECTION,
    batchSize: 5,
  });
  const totalStyleFindings = styleResult.findings.length;
  const styleFindings = styleResult.findings.slice(0, MAX_VISIBLE_OBSERVATIONS).map((finding) => ({
    ...mapStyleFinding(finding, titleBySectionId.get(finding.sectionId) ?? "Sección"),
    reviewStatus: reviewStatusFor(
      review?.decisions,
      `escribiendo:analysis-ignore:${session.user.id}:${bookId}:style:${finding.id}`,
    ),
  }));

  const repetitionResult = analyzeRepetition(
    analysisSections.map((section) => ({
      bookId,
      sectionId: section.id,
      chapterId: section.chapterId,
      contentVersion: section.version,
      contentHash: section.contentHash,
      document: section.document,
    })),
    {
      maxSections: MAX_ANALYSIS_SECTIONS,
      maxParagraphs: 1_600,
      maxTokens: 40_000,
      maxCandidatePairs: 2_500,
      paragraphSimilarityThreshold: 0.88,
    },
  );
  const totalRepetitionFindings = repetitionResult.observations.length;
  const repetitionFindings = repetitionResult.observations
    .slice(0, MAX_VISIBLE_OBSERVATIONS)
    .map((finding) => ({
      ...mapRepetitionFinding(finding, titleBySectionId),
      reviewStatus: reviewStatusFor(
        review?.decisions,
        `escribiendo:analysis-ignore:${session.user.id}:${bookId}:repetition:${finding.id}:${finding.first.contentVersion}:${finding.second.contentVersion}`,
      ),
    }));

  const readabilityAnalysis = analyzeReadability(linguisticInputs);
  const readability = readabilityAnalysis.documents.map(mapReadability);
  const rhythmAnalysis = analyzeRhythm(
    buildRhythmChapterInputs(
      analysisSections.map((section) => ({
        id: section.id,
        title: section.title,
        version: section.version,
        contentHash: section.contentHash,
        blocks: section.blocks,
      })),
      chapterBySection,
    ),
  );
  const rhythm = rhythmAnalysis.chapters.map(mapRhythm);

  const warnings: string[] = [];
  if (styleResult.errors.length) {
    warnings.push("Una o más reglas de estilo no pudieron ejecutarse; las demás continuaron.");
  }
  if (styleResult.sections.some((section) => section.truncated)) {
    warnings.push("El corrector limitó algunas observaciones para mantener el análisis acotado.");
  }
  if (repetitionResult.truncated) {
    warnings.push(
      "El detector aplicó sus límites de seguridad: " + repetitionResult.limitsHit.join(", ") + ".",
    );
  }

  return {
    bookId,
    userId: session.user.id,
    bookTitle: book.title,
    canReview: canPerform(session.workspace.role, "comment:create"),
    openStyleFindings: styleResult.findings.filter(
      (finding) =>
        reviewStatusFor(
          review?.decisions,
          `escribiendo:analysis-ignore:${session.user.id}:${bookId}:style:${finding.id}`,
        ) === "open",
    ).length,
    openRepetitionFindings: repetitionResult.observations.filter(
      (finding) =>
        reviewStatusFor(
          review?.decisions,
          `escribiendo:analysis-ignore:${session.user.id}:${bookId}:repetition:${finding.id}:${finding.first.contentVersion}:${finding.second.contentVersion}`,
        ) === "open",
    ).length,
    sectionOptions: flattenSectionTree(tree)
      .filter((node) => NARRATIVE_ANALYSIS_TYPES.has(node.type))
      .map(({ id, title }) => ({ id, title })),
    selectedSectionId: options.sectionId,
    disabledRules: disabledStyleRules([...configuredRules]),
    sectionsAnalyzed: analysisSections.length,
    omittedSections,
    styleFindings,
    totalStyleFindings,
    repetitionFindings,
    totalRepetitionFindings,
    readability,
    rhythm,
    chapterLengthVariation: rhythmAnalysis.chapterLengthVariation,
    rhythmNote: rhythmAnalysis.note,
    analysisWarning: warnings.length ? warnings.join(" ") : null,
    repetitionTruncated: repetitionResult.truncated,
  };
}
