export type NarrativeRoleSuggestion =
  "PROTAGONIST" | "ANTAGONIST" | "MAIN" | "SECONDARY" | "INCIDENTAL" | "MENTIONED";

export type CharacterFieldKey =
  | "fullName"
  | "nickname"
  | "age"
  | "birthDate"
  | "gender"
  | "nationality"
  | "origin"
  | "profession"
  | "height"
  | "build"
  | "hair"
  | "eyes"
  | "distinguishingFeatures"
  | "clothing"
  | "personality"
  | "strengths"
  | "weaknesses"
  | "fears"
  | "desires"
  | "motivations"
  | "internalConflicts"
  | "secrets"
  | "background"
  | "family"
  | "relevantExperiences"
  | "narrativeGoals"
  | "evolution"
  | "fate";

export type EvidenceKind = "EXPLICIT" | "INFERRED";

export type RelationType =
  "FAMILY" | "FRIEND" | "ROMANCE" | "RIVALRY" | "CONFLICT" | "ALLIANCE" | "OTHER";

export type EventType = "EVENT" | "TRANSFORMATION" | "DECISION";

export interface AnalysisSection {
  id: string;
  title: string;
  content: string;
  order: number;
  kind?: string;
}

export interface AnalysisSectionInfo {
  id: string;
  title: string;
  order: number;
  wordCount: number;
}

export interface CharacterFactCandidate {
  characterKey: string;
  characterName: string;
  field: CharacterFieldKey;
  value: string;
  excerpt: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  offset: number;
  confidence: number;
  source: EvidenceKind;
  evidence: string;
}

export interface CharacterRelationCandidate {
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  type: RelationType;
  label: string;
  excerpt: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  offset: number;
  confidence: number;
  source: EvidenceKind;
}

export interface CharacterEventCandidate {
  characterKey: string;
  characterName: string;
  type: EventType;
  title: string;
  description: string;
  excerpt: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  offset: number;
  confidence: number;
}

export interface CharacterAppearanceExcerpt {
  quote: string;
  offset: number;
  isDialogue: boolean;
}

export interface CharacterAppearance {
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  count: number;
  dialogueCount: number;
  excerpts: CharacterAppearanceExcerpt[];
}

export interface DetectedCharacter {
  key: string;
  primaryName: string;
  fullName: string | null;
  variants: string[];
  aliases: string[];
  mentionCount: number;
  dialogueMentions: number;
  sectionIds: string[];
  firstSectionId: string;
  firstSectionTitle: string;
  lastSectionId: string;
  lastSectionTitle: string;
  role: NarrativeRoleSuggestion;
  roleConfidence: number;
  roleReason: string;
  confidence: number;
  mergeConfidence: number;
  notes: string[];
  suggestedFields: CharacterFactCandidate[];
  relations: CharacterRelationCandidate[];
  events: CharacterEventCandidate[];
  appearances: CharacterAppearance[];
}

export type ContinuityAlertType =
  "AGE" | "EYES" | "HAIR" | "BIRTH_DATE" | "DEATH" | "NAME" | "RELATIONSHIP";

export interface ContinuityAlert {
  key: string;
  characterKey: string;
  characterName: string;
  type: ContinuityAlertType;
  title: string;
  message: string;
  severity: "INFO" | "WARNING";
  confidence: number;
  sectionIds: string[];
  excerpts: string[];
  suggestion: string;
}

export interface CharacterAnalysisStats {
  sectionsAnalyzed: number;
  wordsAnalyzed: number;
  candidateNames: number;
  charactersDetected: number;
  durationMs: number;
}

export interface CharacterAnalysisResult {
  characters: DetectedCharacter[];
  alerts: ContinuityAlert[];
  sections: AnalysisSectionInfo[];
  warnings: string[];
  stats: CharacterAnalysisStats;
}

export interface NameOccurrence {
  text: string;
  normalized: string;
  tokens: string[];
  start: number;
  end: number;
  sentenceIndex: number;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  sectionText: string;
  sentenceText: string;
  sentenceStart: number;
  sentenceEnd: number;
  isSentenceInitial: boolean;
  isDialogue: boolean;
  score: number;
  personCue: string | null;
  negativeCue: string | null;
  hasActionCue: boolean;
  hasSpeechCue: boolean;
}
