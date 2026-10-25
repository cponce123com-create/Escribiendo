import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BookAnalysisDashboard } from "./book-analysis-dashboard";
import type { BookAnalysisDashboardProps } from "./book-analysis-dashboard";

vi.mock("@/lib/books/laboratory-review-actions", () => ({ saveLaboratoryReviewAction: vi.fn() }));

const props: BookAnalysisDashboardProps = {
  bookId: "libro-1",
  userId: "user-1",
  bookTitle: "La casa del río",
  sectionsAnalyzed: 2,
  omittedSections: 0,
  styleFindings: [
    {
      id: "style-1",
      category: "style",
      severity: "info",
      confidence: 0.76,
      message: "Conector repetido en oraciones próximas.",
      explanation: "Puede ser un recurso deliberado.",
      suggestions: ["Revisar el efecto."],
      matchedText: "Entonces",
      sectionId: "cap-1",
      sectionTitle: "Capítulo I",
      contentVersion: 4,
      startOffset: 12,
      endOffset: 21,
    },
  ],
  totalStyleFindings: 1,
  repetitionFindings: [
    {
      id: "rep-1",
      kind: "paragraph-similarity",
      scope: "book",
      algorithm: "paragraph-tfidf-cosine-v1",
      score: 0.91,
      matchedText: "El río seguía su curso entre los árboles.",
      message: "Estos párrafos presentan similitud textual.",
      explanation: "La coincidencia de vocabulario no demuestra redundancia semántica.",
      first: {
        sectionId: "cap-1",
        sectionTitle: "Capítulo I",
        contentVersion: 4,
        startOffset: 30,
        endOffset: 70,
      },
      second: {
        sectionId: "cap-2",
        sectionTitle: "Capítulo II",
        contentVersion: 6,
        startOffset: 45,
        endOffset: 85,
      },
    },
  ],
  totalRepetitionFindings: 1,
  readability: [
    {
      sectionId: "cap-1",
      sectionTitle: "Capítulo I",
      wordCount: 240,
      sentenceCount: 18,
      syllableCount: 420,
      paragraphCount: 8,
      meanWordsPerSentence: 13.3,
      meanCharactersPerWord: 4.6,
      fernandezHuerta: 69.2,
      szigrisztPazos: 72.1,
      shortSample: false,
      paragraphDistribution: { "1-19": 3, "20-49": 4, "50-99": 1, "100-199": 0, "200+": 0 },
    },
  ],
  rhythm: [
    {
      sectionId: "cap-1",
      sectionTitle: "Capítulo I",
      wordCount: 240,
      paragraphCount: 8,
      sentenceCount: 18,
      meanParagraphWords: 30,
      dialogueWordPercentage: 25,
      nonDialogueNarrationWordPercentage: 75,
      paragraphLengthDistribution: [
        { label: "1–25 palabras", paragraphCount: 3 },
        { label: "26–50 palabras", paragraphCount: 4 },
      ],
    },
  ],
  chapterLengthVariation: {
    sectionCount: 2,
    meanWords: 210,
    standardDeviationWords: 30,
    standardDeviationKind: "population",
    coefficientOfVariation: 0.14,
  },
  rhythmNote:
    "Estas métricas describen rasgos formales del texto; no miden tensión ni calidad narrativa.",
  analysisWarning: null,
  repetitionTruncated: false,
};

describe("BookAnalysisDashboard", () => {
  it("enlaza cada sugerencia a la versión y al rango UTF-16 de origen", () => {
    const html = renderToStaticMarkup(createElement(BookAnalysisDashboard, props));

    expect(html).toContain("findingStart=12&amp;findingEnd=21&amp;findingVersion=4");
    expect(html).toContain("findingStart=30&amp;findingEnd=70&amp;findingVersion=4");
    expect(html).toContain("findingStart=45&amp;findingEnd=85&amp;findingVersion=6");
    expect(html).toContain(
      'aria-label="Ignorar observación: Conector repetido en oraciones próximas."',
    );
  });

  it("advierte que coincidencia textual y legibilidad no son juicios literarios", () => {
    const html = renderToStaticMarkup(createElement(BookAnalysisDashboard, props));

    expect(html).toContain("La coincidencia de vocabulario no demuestra redundancia semántica.");
    expect(html).toContain("ni medidas de la calidad literaria");
    expect(html).toContain("no miden tensión ni calidad narrativa");
  });

  it("incluye comparativas accesibles de extensión y diálogo entre capítulos", () => {
    const html = renderToStaticMarkup(createElement(BookAnalysisDashboard, props));

    expect(html).toContain("Gráfico de palabras por capítulo");
    expect(html).toContain("Gráfico de proporción de diálogo por capítulo");
    expect(html).toContain("Distribución de extensión de párrafos por capítulo");
    expect(html).toContain("Variación de extensión entre capítulos");
  });
});
