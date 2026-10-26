import type { CharacterNameVerification } from "./personal-name";
/** Extracción narrativa local: el manuscrito nunca sale del servidor de la aplicación. */
export interface CharacterEvidence {
  section: string;
  sectionId?: string;
  nameUsed?: string;
  excerpt: string;
  confidence: number;
  kind: "entity" | "alias" | "age" | "physical" | "dialogue";
}
export interface CharacterCandidate {
  name: string;
  mentions: number;
  role: "PROTAGONIST" | "ANTAGONIST" | "SECONDARY" | "OTHER";
  confidence: number;
  evidence: CharacterEvidence[];
  age?: string;
  description?: string;
  aliases: string[];
  nameVerification?: CharacterNameVerification;
}
export interface NarrativeSection {
  id?: string;
  title: string;
  text: string;
}
/** Compatibilidad pública: ambos flujos usan la misma verificación bidireccional. */
export { verifyCharacterNames as analyzeNarrative } from "./character-name-verifier";
