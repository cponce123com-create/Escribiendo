import type {
  CharacterEventCandidate,
  CharacterFactCandidate,
  ContinuityAlert,
  DetectedCharacter,
  NameOccurrence,
} from "./types";
import { normalizeName, stableKey } from "./text";
import { parseSpanishNumber } from "./facts";

const MEMORY_CUE =
  /\b(record|memoria|sue[ñn]|imagin|pens[oó]|flashback|cuando (?:estaba|era) vivo|tumba|funeral|esp[íi]ritu|fantasma|foto|retrato|recuerdo)\b/iu;

const ACTION_CUE =
  /\b(dijo|pregunt|respond|mir[oó]|entr[oó]|sali[oó]|camin|corri|abraz|bes[oó]|tom[oó]|dej[oó]|volvi[oó]|lleg[oó]|decidi[oó]|grit|llor|sonri)\b/iu;

function uniqueExcerpts(facts: CharacterFactCandidate[], limit = 3): string[] {
  const seen = new Set<string>();
  const excerpts: string[] = [];
  for (const fact of facts) {
    if (seen.has(fact.excerpt)) continue;
    seen.add(fact.excerpt);
    excerpts.push(fact.excerpt);
    if (excerpts.length >= limit) break;
  }
  return excerpts;
}

function sectionLabel(fact: CharacterFactCandidate): string {
  return `«${fact.sectionTitle || "Sin título"}»`;
}

function ageAlert(
  character: DetectedCharacter,
  facts: CharacterFactCandidate[],
): ContinuityAlert | null {
  const ages = facts
    .filter((fact) => fact.field === "age")
    .map((fact) => ({ fact, age: parseSpanishNumber(fact.value) }))
    .filter((item): item is { fact: CharacterFactCandidate; age: number } => item.age !== null);

  const distinct = Array.from(new Set(ages.map((item) => item.age)));
  if (distinct.length < 2) return null;

  const examples = ages.slice(0, 4);
  const detail = examples.map((item) => `${sectionLabel(item.fact)}: ${item.age} años`).join("; ");

  return {
    key: stableKey(`${character.key}|age|${distinct.sort((a, b) => a - b).join("-")}`),
    characterKey: character.key,
    characterName: character.primaryName,
    type: "AGE",
    title: "Posible cambio de edad",
    message: `${character.primaryName} aparece con edades distintas: ${detail}.`,
    severity: "WARNING",
    confidence: 0.58,
    sectionIds: Array.from(new Set(ages.map((item) => item.fact.sectionId))),
    excerpts: uniqueExcerpts(ages.map((item) => item.fact)),
    suggestion:
      "Puede ser un salto temporal, un recuerdo o un narrador poco fiable. Confirma si el cambio es intencional.",
  };
}

function attributeAlert(
  character: DetectedCharacter,
  facts: CharacterFactCandidate[],
  field: "eyes" | "hair",
  type: "EYES" | "HAIR",
  title: string,
): ContinuityAlert | null {
  const values = facts.filter((fact) => fact.field === field);
  const distinct = Array.from(new Set(values.map((fact) => normalizeName(fact.value))));
  if (distinct.length < 2) return null;

  // Las canas pueden aparecer con el paso del tiempo; no son una contradicción.
  if (field === "hair" && distinct.some((value) => value.includes("cana"))) return null;

  return {
    key: stableKey(`${character.key}|${type}|${distinct.sort().join("|")}`),
    characterKey: character.key,
    characterName: character.primaryName,
    type,
    title,
    message: `${character.primaryName} aparece con descripciones distintas: ${values
      .slice(0, 4)
      .map((fact) => `${sectionLabel(fact)}: ${fact.value}`)
      .join("; ")}.`,
    severity: field === "eyes" ? "WARNING" : "INFO",
    confidence: field === "eyes" ? 0.67 : 0.46,
    sectionIds: Array.from(new Set(values.map((fact) => fact.sectionId))),
    excerpts: uniqueExcerpts(values),
    suggestion:
      "Revisa si hubo un cambio deliberado, un disfraz, una descripción metafórica o un error de continuidad.",
  };
}

function birthDateAlert(
  character: DetectedCharacter,
  facts: CharacterFactCandidate[],
): ContinuityAlert | null {
  const values = facts.filter((fact) => fact.field === "birthDate");
  const distinct = Array.from(new Set(values.map((fact) => normalizeName(fact.value))));
  if (distinct.length < 2) return null;

  return {
    key: stableKey(`${character.key}|birth|${distinct.sort().join("|")}`),
    characterKey: character.key,
    characterName: character.primaryName,
    type: "BIRTH_DATE",
    title: "Posible contradicción en la fecha de nacimiento",
    message: `${character.primaryName} tiene fechas de nacimiento distintas: ${values
      .slice(0, 4)
      .map((fact) => `${sectionLabel(fact)}: ${fact.value}`)
      .join("; ")}.`,
    severity: "WARNING",
    confidence: 0.62,
    sectionIds: Array.from(new Set(values.map((fact) => fact.sectionId))),
    excerpts: uniqueExcerpts(values),
    suggestion: "Comprueba si una de las fechas corresponde a otro personaje o a un recuerdo.",
  };
}

function deathAlert(
  character: DetectedCharacter,
  events: CharacterEventCandidate[],
  occurrences: NameOccurrence[],
): ContinuityAlert | null {
  const death = events
    .filter((event) =>
      /(?<![\p{L}\p{N}])(?:muri[oó]|falleci[oó])(?![\p{L}\p{N}])/iu.test(event.description),
    )
    .sort((a, b) => a.sectionOrder - b.sectionOrder)[0];

  if (!death) return null;

  const later = occurrences
    .filter(
      (occurrence) =>
        occurrence.sectionOrder > death.sectionOrder &&
        !MEMORY_CUE.test(occurrence.sentenceText) &&
        (occurrence.hasActionCue ||
          occurrence.hasSpeechCue ||
          ACTION_CUE.test(occurrence.sentenceText)),
    )
    .sort((a, b) => a.sectionOrder - b.sectionOrder)[0];

  if (!later) return null;

  return {
    key: stableKey(`${character.key}|death|${death.sectionId}|${later.sectionId}`),
    characterKey: character.key,
    characterName: character.primaryName,
    type: "DEATH",
    title: "Aparición posterior a una muerte",
    message: `${character.primaryName} muere o fallece en «${death.sectionTitle}», pero vuelve a actuar en «${later.sectionTitle}».`,
    severity: "WARNING",
    confidence: 0.54,
    sectionIds: [death.sectionId, later.sectionId],
    excerpts: [death.excerpt, later.sentenceText],
    suggestion:
      "Puede tratarse de un recuerdo, un salto temporal, un narrador poco fiable o un personaje que no murió realmente. Confírmalo antes de corregirlo.",
  };
}

/**
 * Alertas prudentes, nunca afirmaciones de error. Solo se generan cuando hay
 * dos datos incompatibles en el texto y siempre se ofrece una explicación
 * narrativa posible.
 */
export function detectContinuityAlerts(
  characters: DetectedCharacter[],
  factsByCharacter: Map<string, CharacterFactCandidate[]>,
  eventsByCharacter: Map<string, CharacterEventCandidate[]>,
  occurrencesByCharacter: Map<string, NameOccurrence[]>,
): ContinuityAlert[] {
  const alerts: ContinuityAlert[] = [];

  for (const character of characters) {
    const facts = factsByCharacter.get(character.key) ?? [];
    const events = eventsByCharacter.get(character.key) ?? [];
    const occurrences = occurrencesByCharacter.get(character.key) ?? [];

    const candidates = [
      ageAlert(character, facts),
      attributeAlert(character, facts, "eyes", "EYES", "Posible cambio en el color de ojos"),
      attributeAlert(character, facts, "hair", "HAIR", "Posible cambio en el cabello"),
      birthDateAlert(character, facts),
      deathAlert(character, events, occurrences),
    ].filter((alert): alert is ContinuityAlert => alert !== null);

    alerts.push(...candidates);
  }

  return alerts.sort(
    (a, b) =>
      (a.severity === "WARNING" ? 0 : 1) - (b.severity === "WARNING" ? 0 : 1) ||
      b.confidence - a.confidence,
  );
}
