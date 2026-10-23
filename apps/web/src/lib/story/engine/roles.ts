import type { CharacterAppearance, NarrativeRoleSuggestion } from "./types";
import type { NameCluster } from "./names";

const CONFLICT_CUE =
  /\b(contra|enemig|odia|odio|amenaz|atac|golpe|mat[oó]|venganza|rival|discut|grit|enfrent|traicion|celos)\b/iu;

export interface RoleClassification {
  role: NarrativeRoleSuggestion;
  confidence: number;
  reason: string;
}

/**
 * La clasificación es una sugerencia editorial. Combina presencia,
 * distribución, diálogo, acción y conflicto; no se limita a contar menciones.
 */
export function classifyNarrativeRole(
  cluster: NameCluster,
  appearances: CharacterAppearance[],
  totalSections: number,
  dialogueMentions: number,
  maxMentions: number,
  minSectionOrder: number,
  maxSectionOrder: number,
): RoleClassification {
  const mentionCount = cluster.occurrences.length;
  const coverage = totalSections > 0 ? appearances.length / totalSections : 0;
  const mentionShare = maxMentions > 0 ? mentionCount / maxMentions : 0;
  const actionMentions = cluster.occurrences.filter(
    (occurrence) => occurrence.hasActionCue || occurrence.hasSpeechCue,
  ).length;
  const conflictMentions = cluster.occurrences.filter((occurrence) =>
    CONFLICT_CUE.test(occurrence.sentenceText),
  ).length;
  const dialogueRatio = mentionCount > 0 ? dialogueMentions / mentionCount : 0;
  const actionRatio = mentionCount > 0 ? actionMentions / mentionCount : 0;
  const conflictRatio = mentionCount > 0 ? conflictMentions / mentionCount : 0;
  const span = Math.max(1, maxSectionOrder - minSectionOrder);
  const opening = appearances.some(
    (appearance) => appearance.sectionOrder <= minSectionOrder + span * 0.2,
  );
  const closing = appearances.some(
    (appearance) => appearance.sectionOrder >= maxSectionOrder - span * 0.2,
  );

  const baseReason = `Aparece en ${appearances.length} de ${totalSections} secciones, con ${mentionCount} menciones y ${dialogueMentions} diálogos atribuidos.`;

  const mentioned =
    mentionCount <= 2 && dialogueMentions === 0 && actionMentions === 0 && appearances.length === 1;

  if (mentioned) {
    return {
      role: "MENTIONED",
      confidence: 0.58,
      reason: `${baseReason} No se detectan acciones ni diálogos atribuidos; podría ser solo una mención.`,
    };
  }

  const protagonistScore =
    coverage * 0.5 +
    mentionShare * 0.2 +
    (dialogueRatio > 0.02 ? 0.12 : 0) +
    (opening ? 0.09 : 0) +
    (closing ? 0.09 : 0);

  if (protagonistScore >= 0.62 && mentionShare >= 0.3 && actionRatio >= 0.15) {
    return {
      role: "PROTAGONIST",
      confidence: 0.53,
      reason: `${baseReason} Tiene presencia sostenida${opening ? " desde el inicio" : ""}${closing ? " y hasta el cierre" : ""}, además de acción o diálogo. Es una sugerencia, no una etiqueta definitiva.`,
    };
  }

  if (conflictRatio >= 0.22 && coverage >= 0.2 && mentionShare >= 0.12) {
    return {
      role: "ANTAGONIST",
      confidence: 0.4,
      reason: `${baseReason} Una parte relevante de sus apariciones contiene conflicto, amenaza o enfrentamiento. La oposición puede ser deliberada o solo una interpretación del texto.`,
    };
  }

  if (coverage >= 0.25 || mentionShare >= 0.3) {
    return {
      role: "MAIN",
      confidence: 0.6,
      reason: `${baseReason} Su presencia es amplia o sostenida en la novela, sin que el texto permita afirmar que sea el protagonista.`,
    };
  }

  if (appearances.length >= 2 || mentionCount >= 3) {
    return {
      role: "SECONDARY",
      confidence: 0.7,
      reason: `${baseReason} Participa en más de una sección o deja varias menciones, pero con menor centralidad narrativa.`,
    };
  }

  return {
    role: "INCIDENTAL",
    confidence: 0.72,
    reason: `${baseReason} Su presencia es breve y localizada; puede ser un personaje incidental.`,
  };
}
