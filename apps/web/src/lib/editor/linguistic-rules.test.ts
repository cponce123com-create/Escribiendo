import { describe, expect, it } from "vitest";
import { LinguisticAnalysisEngine, type LinguisticSectionInput } from "@escribiendo/book-schema";
import {
  analyzeLocalSection,
  hashEditorialSnapshot,
  LOCAL_PROOFREADER_RULES,
} from "./linguistic-rules";

const section: LinguisticSectionInput = {
  bookId: "book-1",
  sectionId: "section-1",
  sectionTitle: "Capítulo 1",
  sectionType: "CHAPTER",
  contentVersion: 3,
  contentHash: "sha256:fixture",
  revisionId: "revision-3",
  document: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "despues,  la casa casa!!" }],
      },
    ],
  },
};

describe("adaptador de reglas del corrector local", () => {
  it("reutiliza reglas existentes y devuelve hallazgos anclados a la versión de Tiptap", () => {
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [section], {
      rules: LOCAL_PROOFREADER_RULES,
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "local-proofreader/common-typo",
      "local-proofreader/spacing",
      "local-proofreader/repeated-word",
      "local-proofreader/punctuation",
    ]);
    for (const finding of result.findings) {
      expect(finding).toMatchObject({
        bookId: "book-1",
        sectionId: "section-1",
        revisionId: "revision-3",
        contentVersion: 3,
        contentHash: "sha256:fixture",
        coordinateSystem: "prosemirror-utf16",
        status: "open",
      });
      expect(finding.startOffset).toBeGreaterThan(0);
      expect(finding.endOffset).toBeGreaterThan(finding.startOffset);
      expect(finding.suggestions).toHaveLength(1);
    }
  });

  it("respeta la preferencia individual sin desactivar otras reglas", () => {
    const result = new LinguisticAnalysisEngine().analyzeBook("book-1", [section], {
      rules: LOCAL_PROOFREADER_RULES,
      preferences: {
        enabledByRuleId: {
          "local-proofreader/common-typo": false,
          "local-proofreader/repeated-word": false,
        },
      },
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "local-proofreader/spacing",
      "local-proofreader/punctuation",
    ]);
  });

  it("genera SHA-256 local y no vuelve a mostrar una observación ignorada en la misma versión", async () => {
    const engine = new LinguisticAnalysisEngine();
    const { contentHash, ...snapshot } = section;
    expect(contentHash).toBe("sha256:fixture");
    expect(await hashEditorialSnapshot(snapshot.document)).toMatch(/^[a-f\d]{64}$/u);
    const firstRun = await analyzeLocalSection(engine, snapshot);
    const repeated = firstRun.find((issue) => issue.rule === "repeated-word");
    expect(repeated?.original).toBe("casa casa");

    const secondRun = await analyzeLocalSection(engine, snapshot, {
      previousFindings: [{ id: repeated?.id ?? "", status: "ignored" }],
    });
    expect(secondRun.some((issue) => issue.id === repeated?.id)).toBe(false);
  });
});
