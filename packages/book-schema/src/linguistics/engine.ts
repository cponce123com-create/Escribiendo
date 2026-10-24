import { countWordsInDocument, parseTiptapDocument } from "../tiptap";
import {
  extractTiptapTextBlocks,
  getTiptapNodeSize,
  splitSpanishSentences,
  tokenizeSpanishText,
} from "./text";
import type {
  AnalyzeBatchesOptions,
  EditorialFinding,
  EditorialRule,
  EditorialRuleFinding,
  LinguisticAnalysisError,
  LinguisticAnalysisOptions,
  LinguisticAnalysisResult,
  LinguisticRuleContext,
  LinguisticSectionInput,
  LinguisticSectionResult,
  LinguisticSectionStats,
  LinguisticSentence,
  LinguisticToken,
} from "./types";

interface CacheEntry {
  key: string;
  scope: string;
  result: Omit<LinguisticSectionResult, "cacheHit">;
}

const DEFAULT_MAX_FINDINGS_PER_SECTION = 500;

function normalizeOptions(options: LinguisticAnalysisOptions): {
  rules: EditorialRule[];
  preferences: Readonly<Record<string, boolean>>;
  previousStatuses: Map<string, EditorialFinding["status"]>;
  maxFindings: number;
} {
  const rules = [...options.rules].sort((left, right) => left.id.localeCompare(right.id, "en"));
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!rule.id.trim() || !rule.version.trim()) {
      throw new TypeError("Cada regla lingüística debe declarar id y versión.");
    }
    if (seen.has(rule.id)) {
      throw new TypeError(`El identificador de regla «${rule.id}» está duplicado.`);
    }
    if (!Number.isFinite(rule.confidence) || rule.confidence < 0 || rule.confidence > 1) {
      throw new RangeError(`La confianza por defecto de «${rule.id}» debe estar entre 0 y 1.`);
    }
    seen.add(rule.id);
  }

  const maxFindings = options.maxFindingsPerSection ?? DEFAULT_MAX_FINDINGS_PER_SECTION;
  if (!Number.isInteger(maxFindings) || maxFindings < 1) {
    throw new RangeError("maxFindingsPerSection debe ser un entero mayor que cero.");
  }

  return {
    rules,
    preferences: options.preferences?.enabledByRuleId ?? {},
    previousStatuses: new Map(
      (options.previousFindings ?? []).map((finding) => [finding.id, finding.status]),
    ),
    maxFindings,
  };
}

function buildContext(section: LinguisticSectionInput): {
  context: LinguisticRuleContext;
  stats: LinguisticSectionStats;
  documentSize: number;
} {
  const document = parseTiptapDocument(section.document);
  const textBlocks = extractTiptapTextBlocks(document);
  const sentences: LinguisticSentence[] = [];
  const tokens: LinguisticToken[] = [];
  let sentenceIndex = 0;

  for (const block of textBlocks) {
    const blockSentences = splitSpanishSentences(block.text);
    for (const sentence of blockSentences) {
      const globalSentence: LinguisticSentence = {
        text: sentence.text,
        startOffset: block.startOffset + sentence.start,
        endOffset: block.startOffset + sentence.end,
        index: sentenceIndex,
        isDialogue: block.isDialogue,
        blockType: block.type,
        paragraphIndex: block.paragraphIndex,
      };
      sentences.push(globalSentence);
      for (const token of tokenizeSpanishText(sentence.text, globalSentence.startOffset)) {
        tokens.push({ ...token, sentenceIndex, capitalized: token.capitalized });
      }
      sentenceIndex += 1;
    }
  }

  const stats: LinguisticSectionStats = {
    words: countWordsInDocument(document),
    sentences: sentences.length,
    paragraphs: textBlocks
      .filter((block) => block.type === "paragraph")
      .reduce((sum, block, index, all) => {
        if (index === 0 || all[index - 1]?.paragraphIndex !== block.paragraphIndex) return sum + 1;
        return sum;
      }, 0),
    headings: textBlocks
      .filter((block) => block.type === "heading")
      .reduce((sum, block, index, all) => {
        if (index === 0 || all[index - 1]?.paragraphIndex !== block.paragraphIndex) return sum + 1;
        return sum;
      }, 0),
    dialogues: sentences.filter((sentence) => sentence.isDialogue).length,
  };

  return {
    context: { section, document, textBlocks, sentences, tokens },
    stats,
    documentSize: getTiptapNodeSize(document),
  };
}

function emptyStats(): LinguisticSectionStats {
  return { words: 0, sentences: 0, paragraphs: 0, headings: 0, dialogues: 0 };
}

function ruleSignature(
  rules: readonly EditorialRule[],
  preferences: Readonly<Record<string, boolean>>,
): string {
  return JSON.stringify(
    rules.map((rule) => [rule.id, rule.version, preferences[rule.id] ?? rule.defaultEnabled]),
  );
}

function sectionCacheKey(section: LinguisticSectionInput, rulesKey: string): string {
  return JSON.stringify([
    section.bookId,
    section.sectionId,
    section.revisionId ?? null,
    section.contentVersion,
    section.contentHash,
    section.sectionTitle,
    section.sectionType ?? null,
    rulesKey,
  ]);
}

function findingId(
  section: LinguisticSectionInput,
  ruleId: string,
  startOffset: number,
  endOffset: number,
): string {
  return [
    "finding",
    encodeURIComponent(ruleId),
    section.bookId,
    section.sectionId,
    section.revisionId ?? `v${section.contentVersion}`,
    encodeURIComponent(section.contentHash),
    startOffset,
    endOffset,
  ].join(":");
}

function isValidConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function createFinding(
  section: LinguisticSectionInput,
  rule: EditorialRule,
  hit: EditorialRuleFinding,
  previousStatuses: ReadonlyMap<string, EditorialFinding["status"]>,
  context: LinguisticRuleContext,
  documentSize: number,
): EditorialFinding | null {
  if (
    !Number.isInteger(hit.startOffset) ||
    !Number.isInteger(hit.endOffset) ||
    hit.startOffset < 0 ||
    hit.endOffset <= hit.startOffset ||
    hit.endOffset > documentSize
  ) {
    return null;
  }

  const confidence = hit.confidence ?? rule.confidence;
  if (!isValidConfidence(confidence)) return null;

  const id = findingId(section, rule.id, hit.startOffset, hit.endOffset);
  const block = context.textBlocks.find(
    (candidate) => candidate.startOffset <= hit.startOffset && candidate.endOffset >= hit.endOffset,
  );
  const matchedText =
    hit.matchedText ??
    (block
      ? block.text.slice(hit.startOffset - block.startOffset, hit.endOffset - block.startOffset)
      : undefined);

  return {
    id,
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    confidence,
    bookId: section.bookId,
    sectionId: section.sectionId,
    ...(section.revisionId === undefined ? {} : { revisionId: section.revisionId }),
    contentVersion: section.contentVersion,
    contentHash: section.contentHash,
    coordinateSystem: "prosemirror-utf16",
    startOffset: hit.startOffset,
    endOffset: hit.endOffset,
    message: hit.message,
    explanation: hit.explanation,
    ...(hit.suggestions === undefined ? {} : { suggestions: [...hit.suggestions] }),
    status: previousStatuses.get(id) ?? "open",
    ...(matchedText === undefined ? {} : { matchedText }),
  };
}

function applyPreviousStatuses(
  findings: readonly EditorialFinding[],
  previousStatuses: ReadonlyMap<string, EditorialFinding["status"]>,
): EditorialFinding[] {
  return findings.map((finding) => ({
    ...finding,
    status: previousStatuses.get(finding.id) ?? finding.status,
  }));
}

function sumStats(results: readonly LinguisticSectionResult[]): LinguisticSectionStats {
  return results.reduce(
    (sum, result) => ({
      words: sum.words + result.stats.words,
      sentences: sum.sentences + result.stats.sentences,
      paragraphs: sum.paragraphs + result.stats.paragraphs,
      headings: sum.headings + result.stats.headings,
      dialogues: sum.dialogues + result.stats.dialogues,
    }),
    emptyStats(),
  );
}

function createYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Motor sin estado global para ejecutar reglas independientes sobre snapshots
 * de secciones Tiptap. La caché vive en esta instancia y nunca persiste manuscritos.
 */
export class LinguisticAnalysisEngine {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxCachedSections: number;

  constructor(options: { maxCachedSections?: number } = {}) {
    const maxCachedSections = options.maxCachedSections ?? 500;
    if (!Number.isInteger(maxCachedSections) || maxCachedSections < 1) {
      throw new RangeError("maxCachedSections debe ser un entero mayor que cero.");
    }
    this.maxCachedSections = maxCachedSections;
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateSection(bookId: string, sectionId: string): void {
    const scope = JSON.stringify([bookId, sectionId]);
    for (const [key, value] of this.cache) {
      if (value.scope === scope) this.cache.delete(key);
    }
  }

  analyzeSection(
    section: LinguisticSectionInput,
    options: LinguisticAnalysisOptions,
  ): LinguisticSectionResult {
    if (!section.bookId || !section.sectionId || !section.contentHash) {
      throw new TypeError("La sección requiere bookId, sectionId y contentHash.");
    }
    if (!Number.isInteger(section.contentVersion) || section.contentVersion < 1) {
      throw new RangeError("contentVersion debe ser un entero positivo.");
    }

    const normalized = normalizeOptions(options);
    const rulesKey = ruleSignature(normalized.rules, normalized.preferences);
    const key = sectionCacheKey(section, rulesKey);
    const scope = JSON.stringify([section.bookId, section.sectionId]);
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return {
        ...cached.result,
        findings: applyPreviousStatuses(cached.result.findings, normalized.previousStatuses),
        cacheHit: true,
      };
    }

    const { context, stats, documentSize } = buildContext(section);
    const findings: EditorialFinding[] = [];
    const errors: LinguisticAnalysisError[] = [];
    let truncated = false;

    for (const rule of normalized.rules) {
      const enabled = normalized.preferences[rule.id] ?? rule.defaultEnabled;
      if (!enabled) continue;

      try {
        const hits = rule.analyze(context);
        for (const hit of hits) {
          const finding = createFinding(
            section,
            rule,
            hit,
            normalized.previousStatuses,
            context,
            documentSize,
          );
          if (!finding) {
            errors.push({
              sectionId: section.sectionId,
              ruleId: rule.id,
              message: "La regla devolvió un hallazgo con rango o confianza inválidos.",
            });
            continue;
          }
          findings.push(finding);
          if (findings.length >= normalized.maxFindings) {
            truncated = true;
            break;
          }
        }
      } catch {
        errors.push({
          sectionId: section.sectionId,
          ruleId: rule.id,
          message: "La regla falló; las demás reglas de esta sección continuaron.",
        });
      }
      if (truncated) break;
    }

    findings.sort(
      (left, right) =>
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset ||
        left.ruleId.localeCompare(right.ruleId, "en"),
    );

    const result: Omit<LinguisticSectionResult, "cacheHit"> = {
      sectionId: section.sectionId,
      contentVersion: section.contentVersion,
      contentHash: section.contentHash,
      findings,
      errors,
      stats,
      truncated,
    };
    this.evictScope(scope);
    this.cache.set(key, { key, scope, result });
    this.evictOverflow();

    return {
      ...result,
      findings: applyPreviousStatuses(result.findings, normalized.previousStatuses),
      cacheHit: false,
    };
  }

  analyzeBook(
    bookId: string,
    sections: readonly LinguisticSectionInput[],
    options: LinguisticAnalysisOptions,
  ): LinguisticAnalysisResult {
    const results: LinguisticSectionResult[] = [];
    for (const section of sections) {
      if (section.bookId !== bookId) {
        throw new TypeError("Todas las secciones analizadas deben pertenecer al mismo libro.");
      }
      results.push(this.analyzeSection(section, options));
    }
    return this.aggregate(bookId, results);
  }

  async analyzeBookInBatches(
    bookId: string,
    sections: readonly LinguisticSectionInput[],
    options: AnalyzeBatchesOptions,
  ): Promise<LinguisticAnalysisResult> {
    const batchSize = options.batchSize ?? 5;
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError("batchSize debe ser un entero mayor que cero.");
    }

    const results: LinguisticSectionResult[] = [];
    const yieldControl = options.yieldControl ?? createYield;
    for (let start = 0; start < sections.length; start += batchSize) {
      const batch = sections.slice(start, start + batchSize);
      for (const section of batch) {
        if (section.bookId !== bookId) {
          throw new TypeError("Todas las secciones analizadas deben pertenecer al mismo libro.");
        }
        results.push(this.analyzeSection(section, options));
      }
      options.onProgress?.(results.length, sections.length);
      if (start + batchSize < sections.length) await yieldControl();
    }
    return this.aggregate(bookId, results);
  }

  private aggregate(bookId: string, sections: LinguisticSectionResult[]): LinguisticAnalysisResult {
    const stats = sumStats(sections);
    const findings = sections.flatMap((section) => section.findings);
    return {
      bookId,
      sections,
      findings,
      errors: sections.flatMap((section) => section.errors),
      stats: {
        ...stats,
        sectionsAnalyzed: sections.length,
        cacheHits: sections.filter((section) => section.cacheHit).length,
        cacheMisses: sections.filter((section) => !section.cacheHit).length,
      },
    };
  }

  private evictScope(scope: string): void {
    for (const [key, value] of this.cache) {
      if (value.scope === scope) this.cache.delete(key);
    }
  }

  private evictOverflow(): void {
    while (this.cache.size > this.maxCachedSections) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) return;
      this.cache.delete(oldestKey);
    }
  }
}

export function analyzeBookLinguistically(
  bookId: string,
  sections: readonly LinguisticSectionInput[],
  options: LinguisticAnalysisOptions,
  engine = new LinguisticAnalysisEngine(),
): LinguisticAnalysisResult {
  return engine.analyzeBook(bookId, sections, options);
}

export function isRuleFinding(value: unknown): value is EditorialRuleFinding {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isInteger(candidate.startOffset) &&
    Number.isInteger(candidate.endOffset) &&
    typeof candidate.message === "string" &&
    typeof candidate.explanation === "string"
  );
}
