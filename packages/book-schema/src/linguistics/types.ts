import type { BookSectionType } from "../metadata";
import type { TiptapDocument } from "../tiptap";
import type { TiptapTextBlock } from "./text";

export type EditorialFindingSeverity = "info" | "warning" | "error";
export type EditorialFindingStatus = "open" | "resolved" | "ignored" | "intentional";
export type EditorialFindingCategory =
  "orthography" | "grammar" | "punctuation" | "style" | "structure" | "dialogue" | "other";

/**
 * Hallazgo anclado a una versión concreta de una sección.
 * Los offsets son posiciones absolutas de ProseMirror (UTF-16), no índices
 * de un texto normalizado o aplanado.
 */
export interface EditorialFinding {
  id: string;
  ruleId: string;
  category: EditorialFindingCategory | (string & {});
  severity: EditorialFindingSeverity;
  confidence: number;
  bookId: string;
  sectionId: string;
  revisionId?: string;
  contentVersion: number;
  contentHash: string;
  coordinateSystem: "prosemirror-utf16";
  startOffset: number;
  endOffset: number;
  message: string;
  explanation: string;
  suggestions?: string[];
  status: EditorialFindingStatus;
  matchedText?: string;
}

/** Snapshot de contenido recibido desde BookSection/SectionRevision o el editor. */
export interface LinguisticSectionInput {
  bookId: string;
  sectionId: string;
  sectionTitle: string;
  sectionType?: BookSectionType;
  contentVersion: number;
  contentHash: string;
  revisionId?: string;
  document: unknown;
}

export interface LinguisticToken {
  text: string;
  /** Comparación NFC y minúscula; conserva tildes y signos diacríticos. */
  normalized: string;
  startOffset: number;
  endOffset: number;
  sentenceIndex: number;
  capitalized: boolean;
}

export interface LinguisticSentence {
  text: string;
  startOffset: number;
  endOffset: number;
  index: number;
  isDialogue: boolean;
  blockType: TiptapTextBlock["type"];
  paragraphIndex: number;
}

export interface LinguisticRuleContext {
  section: LinguisticSectionInput;
  document: TiptapDocument;
  textBlocks: readonly TiptapTextBlock[];
  sentences: readonly LinguisticSentence[];
  tokens: readonly LinguisticToken[];
}

export interface EditorialRuleFinding {
  startOffset: number;
  endOffset: number;
  message: string;
  explanation: string;
  suggestions?: readonly string[];
  matchedText?: string;
  confidence?: number;
}

export interface EditorialRule {
  id: string;
  version: string;
  category: EditorialFindingCategory | (string & {});
  severity: EditorialFindingSeverity;
  confidence: number;
  defaultEnabled: boolean;
  /** Regla local y determinista. No muta el documento ni hace I/O. */
  analyze(context: LinguisticRuleContext): readonly EditorialRuleFinding[];
}

/** Preferencias por regla; un valor explícito prevalece sobre defaultEnabled. */
export interface LinguisticRulePreferences {
  enabledByRuleId?: Readonly<Record<string, boolean>>;
}

export interface LinguisticAnalysisError {
  sectionId: string;
  ruleId: string;
  message: string;
}

export interface LinguisticSectionStats {
  words: number;
  sentences: number;
  paragraphs: number;
  headings: number;
  dialogues: number;
}

export interface LinguisticSectionResult {
  sectionId: string;
  contentVersion: number;
  contentHash: string;
  findings: EditorialFinding[];
  errors: LinguisticAnalysisError[];
  stats: LinguisticSectionStats;
  truncated: boolean;
  cacheHit: boolean;
}

export interface LinguisticAnalysisResult {
  bookId: string;
  sections: LinguisticSectionResult[];
  findings: EditorialFinding[];
  errors: LinguisticAnalysisError[];
  stats: LinguisticSectionStats & {
    sectionsAnalyzed: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

export interface LinguisticAnalysisOptions {
  rules: readonly EditorialRule[];
  preferences?: LinguisticRulePreferences;
  previousFindings?: readonly Pick<EditorialFinding, "id" | "status">[];
  maxFindingsPerSection?: number;
}

export interface AnalyzeBatchesOptions extends LinguisticAnalysisOptions {
  batchSize?: number;
  yieldControl?: () => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
}
