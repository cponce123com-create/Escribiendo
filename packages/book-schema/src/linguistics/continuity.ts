import {
  extractTiptapTextBlocks,
  normalizeSpanishForComparison,
  splitSpanishSentences,
  type TiptapTextBlock,
} from "./text";
import type { TiptapDocument } from "../tiptap";

export const NARRATIVE_FACT_RULE_VERSION = "continuity-1.0.0";

export type NarrativeEvidenceMode = "NARRATION" | "DIALOGUE" | "RECOLLECTION" | "HYPOTHESIS";
export type NarrativeFactType =
  "EYES" | "HAIR" | "AGE" | "BIRTH_YEAR" | "NAME_VARIANT" | "PLACE_VARIANT";

export interface NarrativeEntityCandidate {
  id: string;
  name: string;
}

export interface NarrativeFactEvidence {
  id?: string;
  reviewStatus?: "PROPOSED" | "CONFIRMED" | "REJECTED" | "STALE";
  sectionId: string;
  sectionTitle: string;
  contentVersion: number;
  contentHash: string;
  factType: NarrativeFactType;
  subjectLabel: string;
  subjectNormalized: string;
  valueText: string;
  normalizedValue: string;
  evidenceMode: NarrativeEvidenceMode;
  confidence: number;
  temporalYear: number | null;
  startOffset: number;
  endOffset: number;
  exactQuote: string;
  ruleVersion: string;
}

export interface AnalyzeNarrativeSectionInput {
  sectionId: string;
  sectionTitle: string;
  contentVersion: number;
  contentHash: string;
  document: TiptapDocument;
  characters: NarrativeEntityCandidate[];
  places?: NarrativeEntityCandidate[];
}

export type NarrativeFindingType =
  "PHYSICAL_ATTRIBUTE" | "CHRONOLOGY" | "NAME_VARIANT" | "PLACE_VARIANT";

export interface NarrativeInconsistency {
  findingKey: string;
  type: NarrativeFindingType;
  title: string;
  factA: NarrativeFactEvidence;
  factB: NarrativeFactEvidence | null;
  confidence: number;
  explanation: string;
}

const COLORS: Record<string, string> = {
  azul: "azul",
  azules: "azul",
  verde: "verde",
  verdes: "verde",
  marrón: "marrón",
  marrones: "marrón",
  pardo: "pardo",
  pardos: "pardo",
  negro: "negro",
  negros: "negro",
  negra: "negro",
  negras: "negro",
  gris: "gris",
  grises: "gris",
  avellana: "avellana",
  ámbar: "ámbar",
  rubio: "rubio",
  rubia: "rubio",
  rubios: "rubio",
  rubias: "rubio",
  castaño: "castaño",
  castaña: "castaño",
  castaños: "castaño",
  castañas: "castaño",
  pelirrojo: "pelirrojo",
  pelirroja: "pelirrojo",
  blanco: "blanco",
  blanca: "blanco",
  canoso: "canoso",
  canosa: "canoso",
};
const COLOR_PATTERN = Object.keys(COLORS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const ATTRIBUTES: Array<{ type: "EYES" | "HAIR"; pattern: RegExp }> = [
  {
    type: "EYES",
    pattern: new RegExp(
      `\\b(?:ojos?|iris)\\s+(?:(?:de\\s+)?color\\s+)?(${COLOR_PATTERN})\\b`,
      "giu",
    ),
  },
  {
    type: "HAIR",
    pattern: new RegExp(
      `\\b(?:cabello|pelo|cabellera)\\s+(?:(?:de\\s+)?color\\s+)?(${COLOR_PATTERN})\\b`,
      "giu",
    ),
  },
];
const HYPOTHESIS =
  /(?<![\p{L}\p{N}])(?:quizá|quizas|tal vez|acaso|supuestamente|parecía|parecia|podría|podria|creía|creia|creo que|imaginó|imagino)(?![\p{L}\p{N}])/iu;
const RECOLLECTION =
  /(?<![\p{L}\p{N}])(?:recordaba|recordó|recordo|recuerda|recuerdo|soñó|sono|soñaba|en su recuerdo|años atrás|anos atras)(?![\p{L}\p{N}])/iu;
const YEAR_IN_CONTEXT = /\b(?:en|durante|hacia)\s+(1[0-9]{3}|2[0-9]{3})\b/iu;
const AGE_PATTERN =
  /\b(?:tenía|tenia|tiene|tendría|tendria|cumplió|cumplio)\s+(\d{1,3})\s+años\b/giu;
const AGE_APPOSITIVE_PATTERN = /,\s*de\s+(\d{1,3})\s+años\b/giu;
const BIRTH_PATTERN =
  /\b(?:había nacido|habia nacido|nació|nacio)\s+(?:en\s+)?(1[0-9]{3}|2[0-9]{3})\b/giu;
const PROPER_NAME_PATTERN =
  /(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{M}'’’-]{2,}(?:\s+\p{Lu}[\p{L}\p{M}'’’-]{2,})?(?![\p{L}\p{N}])/gu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function entityMatches(sentence: string, entities: NarrativeEntityCandidate[]) {
  const matches: Array<{ entity: NarrativeEntityCandidate; start: number; end: number }> = [];
  for (const entity of entities) {
    if (!entity.name.trim()) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(entity.name)}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    for (const match of sentence.matchAll(pattern)) {
      const start = match.index;
      if (start !== undefined) matches.push({ entity, start, end: start + match[0].length });
    }
  }
  return matches;
}

function nearestEntity(
  matches: ReturnType<typeof entityMatches>,
  anchor: number,
  sentence?: string,
  excludePrepositionalComplement = false,
): NarrativeEntityCandidate | null {
  const ranked = matches
    .map((match) => ({
      ...match,
      distance:
        anchor < match.start ? match.start - anchor : anchor > match.end ? anchor - match.end : 0,
    }))
    .filter((match) => match.distance <= 90)
    .filter((match) => {
      if (!sentence || !excludePrepositionalComplement) return true;
      const preceding = sentence.slice(Math.max(0, match.start - 36), match.start);
      return !/(?<![\p{L}\p{N}])(?:de|del|para|con|sin|por)(?![\p{L}\p{N}])\s+$/iu.test(preceding);
    })
    .sort((a, b) => a.distance - b.distance);
  if (!ranked.length || (ranked.length > 1 && ranked[0]?.distance === ranked[1]?.distance))
    return null;
  return ranked[0]?.entity ?? null;
}

function modeFor(sentence: string, block: TiptapTextBlock): NarrativeEvidenceMode {
  if (
    block.isDialogue ||
    /^\s*[—–]\s*\S/u.test(sentence) ||
    /^\s*[«“"](?:[^»”"]{1,})[»”"]/u.test(sentence)
  )
    return "DIALOGUE";
  if (HYPOTHESIS.test(sentence)) return "HYPOTHESIS";
  if (RECOLLECTION.test(sentence)) return "RECOLLECTION";
  return "NARRATION";
}

function confidenceFor(mode: NarrativeEvidenceMode): number {
  switch (mode) {
    case "NARRATION":
      return 0.94;
    case "RECOLLECTION":
      return 0.78;
    case "DIALOGUE":
      return 0.68;
    case "HYPOTHESIS":
      return 0.48;
  }
}

function normalized(value: string): string {
  return normalizeSpanishForComparison(value.trim().replace(/\s+/gu, " "));
}

function withoutDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

/** Levenshtein con corte temprano: solo acepta una edición para nombres de seis letras o más. */
function differsByOneCharacter(left: string, right: string): boolean {
  if (left === right) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits === 1;
}

function fact(
  input: AnalyzeNarrativeSectionInput,
  sentence: { text: string; start: number; end: number },
  block: TiptapTextBlock,
  entity: NarrativeEntityCandidate,
  type: NarrativeFactType,
  valueText: string,
  temporalYear: number | null,
): NarrativeFactEvidence {
  const mode = modeFor(sentence.text, block);
  return {
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    contentVersion: input.contentVersion,
    contentHash: input.contentHash,
    factType: type,
    subjectLabel: entity.name,
    subjectNormalized: normalized(entity.name),
    valueText,
    normalizedValue: normalized(valueText),
    evidenceMode: mode,
    confidence: confidenceFor(mode),
    temporalYear,
    startOffset: block.startOffset + sentence.start,
    endOffset: block.startOffset + sentence.end,
    exactQuote: sentence.text,
    ruleVersion: NARRATIVE_FACT_RULE_VERSION,
  };
}

/** Extrae afirmaciones literales conservando offsets UTF-16 absolutos del documento ProseMirror. */
export function extractNarrativeFacts(
  input: AnalyzeNarrativeSectionInput,
): NarrativeFactEvidence[] {
  const blocks = extractTiptapTextBlocks(input.document);
  const facts: NarrativeFactEvidence[] = [];
  const entities = input.characters.filter((item) => item.name.trim());

  for (const block of blocks) {
    for (const sentence of splitSpanishSentences(block.text)) {
      const matches = entityMatches(sentence.text, entities);
      const year = Number(YEAR_IN_CONTEXT.exec(sentence.text)?.[1] ?? NaN);
      const temporalYear = Number.isInteger(year) ? year : null;

      for (const attribute of ATTRIBUTES) {
        attribute.pattern.lastIndex = 0;
        for (const match of sentence.text.matchAll(attribute.pattern)) {
          const index = match.index;
          const color = match[1]?.toLocaleLowerCase("es");
          if (index === undefined || !color) continue;
          const subject = nearestEntity(matches, index);
          if (!subject) continue;
          // Negaciones explícitas y preguntas no se convierten en afirmaciones de atributo.
          const before = sentence.text.slice(0, index);
          if (
            /(?<![\p{L}\p{N}])(?:no|nunca|jamás|jamas|ni)(?![\p{L}\p{N}])/iu.test(before) ||
            /[¿?]/u.test(sentence.text)
          )
            continue;
          facts.push(
            fact(
              input,
              sentence,
              block,
              subject,
              attribute.type,
              COLORS[color] ?? color,
              temporalYear,
            ),
          );
        }
      }

      for (const pattern of [AGE_PATTERN, AGE_APPOSITIVE_PATTERN]) {
        pattern.lastIndex = 0;
        for (const match of sentence.text.matchAll(pattern)) {
          const index = match.index;
          const age = Number(match[1]);
          if (index === undefined || !Number.isInteger(age) || age < 0 || age > 125) continue;
          const subject = nearestEntity(matches, index, sentence.text, true);
          if (!subject) continue;
          const prefix = sentence.text.slice(Math.max(0, index - 24), index);
          if (
            /(?<![\p{L}\p{N}])(?:no|nunca|jamás|jamas)(?![\p{L}\p{N}])/iu.test(prefix) ||
            /[¿?]/u.test(sentence.text)
          )
            continue;
          if (pattern === AGE_APPOSITIVE_PATTERN) {
            const mention = matches.find(
              (item) => item.entity.id === subject.id && item.end <= index,
            );
            if (!mention || index - mention.end > 35) continue;
          }
          facts.push(fact(input, sentence, block, subject, "AGE", String(age), temporalYear));
        }
      }

      BIRTH_PATTERN.lastIndex = 0;
      for (const match of sentence.text.matchAll(BIRTH_PATTERN)) {
        const index = match.index;
        const birthYear = match[1];
        if (index === undefined || !birthYear) continue;
        const subject = nearestEntity(matches, index, sentence.text, true);
        if (!subject) continue;
        if (
          /\b(?:no|nunca|jamás|jamas)\s*$/iu.test(
            sentence.text.slice(Math.max(0, index - 20), index),
          )
        )
          continue;
        facts.push(
          fact(input, sentence, block, subject, "BIRTH_YEAR", birthYear, Number(birthYear)),
        );
      }

      const variantGroups: Array<{
        candidates: NarrativeEntityCandidate[];
        type: "NAME_VARIANT" | "PLACE_VARIANT";
      }> = [
        { candidates: entities, type: "NAME_VARIANT" },
        { candidates: input.places ?? [], type: "PLACE_VARIANT" },
      ];
      for (const group of variantGroups) {
        PROPER_NAME_PATTERN.lastIndex = 0;
        for (const match of sentence.text.matchAll(PROPER_NAME_PATTERN)) {
          const start = match.index;
          const candidate = match[0]?.trim();
          if (start === undefined || !candidate) continue;
          const exact = normalized(candidate);
          const folded = withoutDiacritics(candidate);
          if (group.candidates.some((entity) => normalized(entity.name) === exact)) continue;
          const possible = group.candidates.filter((entity) => {
            const registered = normalized(entity.name);
            if (registered === exact) return false;
            const foldedRegistered = withoutDiacritics(entity.name);
            return (
              foldedRegistered === folded ||
              (Math.min(foldedRegistered.length, folded.length) >= 6 &&
                differsByOneCharacter(foldedRegistered, folded))
            );
          });
          // Una variante que coincide con más de una entidad es ambigua: no alertar.
          if (possible.length !== 1) continue;
          const variant = fact(
            input,
            sentence,
            block,
            possible[0]!,
            group.type,
            candidate,
            temporalYear,
          );
          facts.push({ ...variant, confidence: Math.min(variant.confidence, 0.76) });
        }
      }
    }
  }
  return deduplicateFacts(facts);
}

function deduplicateFacts(facts: NarrativeFactEvidence[]): NarrativeFactEvidence[] {
  const seen = new Set<string>();
  return facts.filter((item) => {
    const key = [
      item.factType,
      item.subjectNormalized,
      item.normalizedValue,
      item.startOffset,
      item.endOffset,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeFinding(
  type: NarrativeFindingType,
  factA: NarrativeFactEvidence,
  factB: NarrativeFactEvidence | null,
  explanation: string,
): NarrativeInconsistency {
  const ids = [
    factA.id ?? `${factA.sectionId}:${factA.startOffset}:${factA.factType}`,
    ...(factB ? [factB.id ?? `${factB.sectionId}:${factB.startOffset}:${factB.factType}`] : []),
  ].sort();
  const findingKey = `${type}:${ids.join(":")}`;
  return {
    findingKey,
    type,
    title:
      type === "CHRONOLOGY"
        ? "Posible inconsistencia cronológica"
        : type === "NAME_VARIANT"
          ? "Posible variación de nombre"
          : type === "PLACE_VARIANT"
            ? "Posible variación de lugar"
            : "Posible inconsistencia física",
    factA,
    factB,
    confidence: factB ? Math.min(factA.confidence, factB.confidence) : factA.confidence,
    explanation,
  };
}

function isReliableNarrative(f: NarrativeFactEvidence): boolean {
  if (f.reviewStatus === "REJECTED" || f.reviewStatus === "STALE") return false;
  if (f.reviewStatus === "CONFIRMED") return true;
  if (f.evidenceMode !== "NARRATION") return false;
  if (f.factType === "NAME_VARIANT" || f.factType === "PLACE_VARIANT") return f.confidence >= 0.72;
  return f.confidence >= 0.85;
}

/** Compara solo hechos narrados de manera explícita; diálogo, recuerdo e hipótesis no se elevan a canon. */
export function detectNarrativeInconsistencies(
  facts: NarrativeFactEvidence[],
): NarrativeInconsistency[] {
  const findings: NarrativeInconsistency[] = [];
  const active = facts.filter((item) => isReliableNarrative(item));
  for (const item of active) {
    if (item.factType === "NAME_VARIANT") {
      findings.push(
        makeFinding(
          "NAME_VARIANT",
          item,
          null,
          `El texto escribe «${item.valueText}», similar al nombre registrado «${item.subjectLabel}». No se fusionaron las entidades; verifica si es una variante intencional.`,
        ),
      );
    } else if (item.factType === "PLACE_VARIANT") {
      findings.push(
        makeFinding(
          "PLACE_VARIANT",
          item,
          null,
          `El texto escribe «${item.valueText}», similar al lugar registrado «${item.subjectLabel}». No se fusionaron las entidades; verifica si es una variante intencional.`,
        ),
      );
    }
  }
  const bySubject = new Map<string, NarrativeFactEvidence[]>();
  for (const item of active) {
    const key = item.subjectNormalized;
    bySubject.set(key, [...(bySubject.get(key) ?? []), item]);
  }

  for (const subjectFacts of bySubject.values()) {
    const attributes = subjectFacts.filter(
      (item) => item.factType === "EYES" || item.factType === "HAIR",
    );
    for (let i = 0; i < attributes.length; i += 1) {
      for (let j = i + 1; j < attributes.length; j += 1) {
        const a = attributes[i];
        const b = attributes[j];
        if (!a || !b || a.factType !== b.factType || a.normalizedValue === b.normalizedValue)
          continue;
        if (a.sectionId === b.sectionId && a.startOffset === b.startOffset) continue;
        findings.push(
          makeFinding(
            "PHYSICAL_ATTRIBUTE",
            a,
            b,
            `La narración atribuye a ${a.subjectLabel} ${a.factType === "EYES" ? "ojos" : "cabello"} de distinto color (${a.valueText} / ${b.valueText}).`,
          ),
        );
      }
    }

    const ages = subjectFacts.filter(
      (item) => item.factType === "AGE" && item.temporalYear !== null,
    );
    for (let i = 0; i < ages.length; i += 1) {
      for (let j = i + 1; j < ages.length; j += 1) {
        const a = ages[i];
        const b = ages[j];
        if (
          !a ||
          !b ||
          a.temporalYear !== b.temporalYear ||
          a.normalizedValue === b.normalizedValue
        )
          continue;
        findings.push(
          makeFinding(
            "CHRONOLOGY",
            a,
            b,
            `Se indican edades distintas (${a.valueText} y ${b.valueText}) para ${a.subjectLabel} en ${a.temporalYear}.`,
          ),
        );
      }
    }

    const birthYears = subjectFacts.filter((item) => item.factType === "BIRTH_YEAR");
    for (const age of ages) {
      for (const birth of birthYears) {
        const year = age.temporalYear;
        const born = Number(birth.valueText);
        const yearsElapsed = year === null ? NaN : year - born;
        const givenAge = Number(age.valueText);
        if (
          !Number.isInteger(yearsElapsed) ||
          yearsElapsed < 0 ||
          givenAge === yearsElapsed ||
          givenAge === yearsElapsed - 1
        )
          continue;
        findings.push(
          makeFinding(
            "CHRONOLOGY",
            birth,
            age,
            `Con nacimiento en ${born} y edad ${givenAge} en ${year}, la edad esperable sería ${yearsElapsed - 1} o ${yearsElapsed} años (según la fecha exacta).`,
          ),
        );
      }
    }
  }

  return [...new Map(findings.map((finding) => [finding.findingKey, finding])).values()];
}
