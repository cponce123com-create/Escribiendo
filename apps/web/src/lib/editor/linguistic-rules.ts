import type {
  LinguisticAnalysisEngine,
  EditorialFindingStatus,
  EditorialRule,
  LinguisticRuleContext,
  LinguisticRulePreferences,
  LinguisticSectionInput,
} from "@escribiendo/book-schema";
import { proofreadText, type ProofreadingIssue } from "./local-proofreader";

type ProofreaderRuleId = ProofreadingIssue["rule"];

const RULES: ReadonlyArray<{
  id: ProofreaderRuleId;
  category: "orthography" | "punctuation" | "style";
  confidence: number;
}> = [
  { id: "repeated-word", category: "style", confidence: 0.9 },
  { id: "spacing", category: "punctuation", confidence: 0.96 },
  { id: "punctuation", category: "punctuation", confidence: 0.72 },
  { id: "capitalization", category: "orthography", confidence: 0.72 },
  { id: "common-typo", category: "orthography", confidence: 0.88 },
];

function analyzeRule(
  context: LinguisticRuleContext,
  ruleId: ProofreaderRuleId,
): Array<{
  startOffset: number;
  endOffset: number;
  message: string;
  explanation: string;
  suggestions: string[];
  matchedText: string;
}> {
  const findings: Array<{
    startOffset: number;
    endOffset: number;
    message: string;
    explanation: string;
    suggestions: string[];
    matchedText: string;
  }> = [];
  for (const block of context.textBlocks) {
    for (const issue of proofreadText(block.text, [ruleId])) {
      findings.push({
        startOffset: block.startOffset + issue.from,
        endOffset: block.startOffset + issue.to,
        message: `Posible corrección: «${issue.suggestion}».`,
        explanation: issue.explanation,
        suggestions: [issue.suggestion],
        matchedText: issue.original,
      });
    }
  }
  return findings;
}

/**
 * Adaptador del corrector local ya usado por el editor. Las categorías se pueden
 * activar por separado mediante LinguisticRulePreferences.enabledByRuleId.
 */
export const LOCAL_PROOFREADER_RULES: readonly EditorialRule[] = RULES.map((rule) => ({
  id: `local-proofreader/${rule.id}`,
  version: "1",
  category: rule.category,
  severity: rule.id === "common-typo" || rule.id === "repeated-word" ? "warning" : "info",
  confidence: rule.confidence,
  defaultEnabled: true,
  analyze: (context) => analyzeRule(context, rule.id),
}));

export type LocalFindingStatus = Pick<
  { id: string; status: EditorialFindingStatus },
  "id" | "status"
>;

export interface LocalProofreaderSnapshot extends Omit<LinguisticSectionInput, "contentHash"> {
  document: LinguisticSectionInput["document"];
}

/** SHA-256 se calcula en el navegador; el texto nunca se envía a un servicio. */
export async function hashEditorialSnapshot(document: unknown): Promise<string> {
  const serialized = JSON.stringify(document);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Ejecuta las reglas reutilizadas sobre una versión local del editor y adapta
 * los hallazgos al formato del panel de revisión existente.
 */
export async function analyzeLocalSection(
  engine: LinguisticAnalysisEngine,
  snapshot: LocalProofreaderSnapshot,
  options: {
    enabledByRuleId?: LinguisticRulePreferences["enabledByRuleId"];
    previousFindings?: readonly LocalFindingStatus[];
  } = {},
): Promise<ProofreadingIssue[]> {
  const contentHash = await hashEditorialSnapshot(snapshot.document);
  const section: LinguisticSectionInput = { ...snapshot, contentHash };
  const result = engine.analyzeBook(section.bookId, [section], {
    rules: LOCAL_PROOFREADER_RULES,
    preferences: { enabledByRuleId: options.enabledByRuleId },
    previousFindings: options.previousFindings,
    maxFindingsPerSection: 100,
  });

  return result.findings
    .filter((finding) => finding.status === "open")
    .map((finding) => ({
      id: finding.id,
      rule: finding.ruleId.slice("local-proofreader/".length) as ProofreaderRuleId,
      from: finding.startOffset,
      to: finding.endOffset,
      original: finding.matchedText ?? "",
      suggestion: finding.suggestions?.[0] ?? "",
      explanation: finding.explanation,
    }));
}
