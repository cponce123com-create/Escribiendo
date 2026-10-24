/** Fixtures sintéticos sin manuscritos privados. Ejecutar: node --import tsx scripts/benchmark-linguistics.ts */
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  parseTiptapDocument,
  analyzeReadability,
  analyzeRepetition,
  analyzeRhythm,
  createSpanishStyleRules,
  extractTiptapTextBlocks,
  LinguisticAnalysisEngine,
  type LinguisticSectionInput,
} from "../packages/book-schema/src/index";

const sentence =
  "María recorrió las calles de San Ramón mientras la lluvia cubría los árboles del camino.".split(
    " ",
  );
for (const words of [10_000, 50_000, 100_000, 200_000]) {
  const sections: LinguisticSectionInput[] = Array.from({ length: words / 1_000 }, (_, index) => {
    const tokens = Array.from({ length: 1_000 }, (_, word) => sentence[word % sentence.length]!);
    const document = {
      type: "doc",
      content: Array.from({ length: 10 }, (_, p) => ({
        type: "paragraph",
        content: [{ type: "text", text: tokens.slice(p * 100, (p + 1) * 100).join(" ") }],
      })),
    };
    return {
      bookId: `benchmark-${words}`,
      sectionId: `section-${index}`,
      sectionTitle: `Capítulo ${index + 1}`,
      contentVersion: 1,
      contentHash: createHash("sha256").update(JSON.stringify(document)).digest("hex"),
      document,
    };
  });
  const engine = new LinguisticAnalysisEngine({ maxCachedSections: sections.length });
  const options = { rules: createSpanishStyleRules(), maxFindingsPerSection: 80, batchSize: 5 };
  const rssBeforeMiB = process.memoryUsage().rss / 1024 ** 2;
  const started = performance.now();
  const cold = await engine.analyzeBookInBatches(sections[0]!.bookId, sections, options);
  const styleMs = performance.now() - started;
  const warmStarted = performance.now();
  const warm = await engine.analyzeBookInBatches(sections[0]!.bookId, sections, options);
  const warmMs = performance.now() - warmStarted;
  const restStarted = performance.now();
  const repetitions = analyzeRepetition(
    sections.map((section) => ({
      ...section,
      document: parseTiptapDocument(section.document),
      chapterId: section.sectionId,
    })),
    {
      maxSections: 120,
      maxParagraphs: 1_600,
      maxTokens: 40_000,
      maxCandidatePairs: 2_500,
      paragraphSimilarityThreshold: 0.88,
    },
  );
  analyzeReadability(sections);
  analyzeRhythm(
    sections.map((section) => ({
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      contentVersion: section.contentVersion,
      contentHash: section.contentHash,
      blocks: extractTiptapTextBlocks(parseTiptapDocument(section.document)),
    })),
  );
  console.log(
    JSON.stringify({
      words,
      sections: sections.length,
      styleMs: +styleMs.toFixed(1),
      warmStyleMs: +warmMs.toFixed(1),
      remainingMetricsMs: +(performance.now() - restStarted).toFixed(1),
      rssBeforeMiB: +rssBeforeMiB.toFixed(1),
      rssAfterMiB: +(process.memoryUsage().rss / 1024 ** 2).toFixed(1),
      cacheHits: warm.stats.cacheHits,
      errors: cold.errors.length,
      repetitionTruncated: repetitions.truncated,
    }),
  );
}
