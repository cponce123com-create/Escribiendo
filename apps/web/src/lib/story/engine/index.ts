import type {
  AnalysisSection,
  AnalysisSectionInfo,
  CharacterAnalysisResult,
  CharacterEventCandidate,
  CharacterFactCandidate,
  CharacterRelationCandidate,
  DetectedCharacter,
  NameOccurrence,
} from "./types";
import {
  clusterNameOccurrences,
  extractAliasHints,
  extractNameOccurrences,
  type AliasHint,
  type NameCluster,
} from "./names";
import {
  excerptFromSentence,
  extractPlainText,
  normalizeName,
  splitSentences,
  wordCount,
} from "./text";
import { buildAppearances, countDialogueMentions } from "./appearances";
import { extractEventsForCharacter, extractFactsForCharacter } from "./facts";
import { extractRelationsForCharacter } from "./relations";
import { classifyNarrativeRole } from "./roles";
import { detectContinuityAlerts } from "./continuity";

export interface AnalyzeManuscriptOptions {
  /** Límite de fichas nuevas para no saturar la interfaz con nombres menores. */
  maxCharacters?: number;
  /** Incluye una advertencia sobre el alcance del motor local. */
  includeEngineNotice?: boolean;
}

interface PreparedSection {
  section: AnalysisSection;
  info: AnalysisSectionInfo;
}

const ROLE_ORDER: Record<DetectedCharacter["role"], number> = {
  PROTAGONIST: 0,
  ANTAGONIST: 1,
  MAIN: 2,
  SECONDARY: 3,
  INCIDENTAL: 4,
  MENTIONED: 5,
};

function prepareSections(sections: AnalysisSection[]): {
  prepared: PreparedSection[];
  occurrences: NameOccurrence[];
  aliasHints: AliasHint[];
  warnings: string[];
} {
  const prepared: PreparedSection[] = [];
  const occurrences: NameOccurrence[] = [];
  const aliasHints: AliasHint[] = [];
  const warnings: string[] = [];

  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    const text = extractPlainText(section.content);
    const normalizedSection: AnalysisSection = { ...section, content: text };
    const words = wordCount(text);
    prepared.push({
      section: normalizedSection,
      info: {
        id: section.id,
        title: section.title || "Sin título",
        order: section.order,
        wordCount: words,
      },
    });

    if (!text.trim()) {
      warnings.push(`La sección «${section.title || "Sin título"}» está vacía o no se pudo leer.`);
      continue;
    }

    const sentences = splitSentences(text);
    if (sentences.length === 0) continue;

    occurrences.push(...extractNameOccurrences(normalizedSection, sentences));
    aliasHints.push(...extractAliasHints(normalizedSection, sentences, occurrences));
  }

  return { prepared, occurrences, aliasHints, warnings };
}

function applyAliasHints(clusters: NameCluster[], hints: AliasHint[]): Map<string, AliasHint> {
  const applied = new Map<string, AliasHint>();

  for (const hint of hints) {
    if (!hint.ownerName) continue;
    const ownerNormalized = normalizeName(hint.ownerName);
    const owner = clusters.find((cluster) =>
      cluster.occurrences.some((occurrence) => occurrence.normalized === ownerNormalized),
    );
    if (!owner) continue;

    const alias = hint.alias.trim();
    if (!alias) continue;

    if (!owner.aliases.some((existing) => normalizeName(existing) === normalizeName(alias))) {
      owner.aliases.push(alias);
    }
    if (!applied.has(owner.key)) applied.set(owner.key, hint);
    if (!owner.notes.some((note) => note.includes(alias))) {
      owner.notes.push(`Apodo detectado: «${alias}».`);
    }
  }

  return applied;
}

function nicknameFact(
  cluster: NameCluster,
  hint: AliasHint | undefined,
): CharacterFactCandidate | null {
  if (!hint || cluster.aliases.length === 0) return null;
  const alias = cluster.aliases[0];
  if (!alias) return null;

  return {
    characterKey: cluster.key,
    characterName: cluster.primaryName,
    field: "nickname",
    value: alias,
    excerpt: hint.excerpt,
    sectionId: hint.sectionId,
    sectionTitle: hint.sectionTitle,
    sectionOrder: hint.sectionOrder,
    offset: hint.offset,
    confidence: 0.9,
    source: "EXPLICIT",
    evidence: "Apodo o sobrenombre mencionado",
  };
}

function filterClusters(
  clusters: NameCluster[],
  maxCharacters: number,
): {
  filtered: NameCluster[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const filtered = clusters.filter((cluster) => {
    if (cluster.occurrences.length >= 2) return true;
    if (cluster.fullName) return true;
    const bestScore = Math.max(...cluster.occurrences.map((occurrence) => occurrence.score), 0);
    return bestScore >= 0.38;
  });

  const ordered = [...filtered].sort(
    (a, b) =>
      b.occurrences.length - a.occurrences.length || a.primaryName.localeCompare(b.primaryName),
  );

  if (ordered.length > maxCharacters) {
    warnings.push(
      `Se han detectado ${ordered.length} nombres; se muestran los ${maxCharacters} con más presencia. Puedes volver a analizar con un manuscrito más acotado.`,
    );
  }

  return { filtered: ordered.slice(0, maxCharacters), warnings };
}

/**
 * Analiza un libro completo o las secciones seleccionadas.
 *
 * Es un motor local y determinista: combina extracción de entidades,
 * atribución de diálogo, contexto narrativo, agrupación conservadora de
 * variantes y reglas de evidencia. No envía el manuscrito a ningún servicio.
 */
export function analyzeManuscript(
  sections: AnalysisSection[],
  options: AnalyzeManuscriptOptions = {},
): CharacterAnalysisResult {
  const startedAt = Date.now();
  const maxCharacters = Math.max(1, Math.min(500, options.maxCharacters ?? 150));
  const {
    prepared,
    occurrences,
    aliasHints,
    warnings: sectionWarnings,
  } = prepareSections(sections);
  const warnings = [...sectionWarnings];

  if (prepared.length === 0) {
    return {
      characters: [],
      alerts: [],
      sections: [],
      warnings: ["No hay secciones analizables. Añade o recupera capítulos antes de analizar."],
      stats: {
        sectionsAnalyzed: 0,
        wordsAnalyzed: 0,
        candidateNames: 0,
        charactersDetected: 0,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const clusters = clusterNameOccurrences(occurrences);
  const aliasByCluster = applyAliasHints(clusters, aliasHints);
  const { filtered, warnings: filterWarnings } = filterClusters(clusters, maxCharacters);
  warnings.push(...filterWarnings);

  const ambiguousSentences = new Map<string, Set<string>>();
  for (const cluster of filtered) {
    for (const occurrence of cluster.occurrences) {
      const key = `${occurrence.sectionId}:${occurrence.sentenceStart}`;
      const keys = ambiguousSentences.get(key) ?? new Set<string>();
      keys.add(cluster.key);
      ambiguousSentences.set(key, keys);
    }
  }
  const ambiguousKeys = new Set(
    Array.from(ambiguousSentences.entries())
      .filter(([, keys]) => keys.size > 1)
      .map(([key]) => key),
  );

  const maxMentions = Math.max(...filtered.map((cluster) => cluster.occurrences.length), 1);
  const sectionOrders = prepared.map((item) => item.info.order);
  const minSectionOrder = Math.min(...sectionOrders);
  const maxSectionOrder = Math.max(...sectionOrders);

  const characters: DetectedCharacter[] = [];

  for (const cluster of filtered) {
    if (!cluster.primaryName) continue;

    const appearances = buildAppearances(cluster);
    if (appearances.length === 0) continue;

    const dialogueMentions = countDialogueMentions(cluster);
    const classification = classifyNarrativeRole(
      cluster,
      appearances,
      prepared.length,
      dialogueMentions,
      maxMentions,
      minSectionOrder,
      maxSectionOrder,
    );

    const facts = extractFactsForCharacter(cluster, ambiguousKeys);
    const nickname = nicknameFact(cluster, aliasByCluster.get(cluster.key));
    if (nickname && !facts.some((fact) => fact.field === "nickname")) {
      facts.unshift(nickname);
    }

    const first = appearances[0];
    const last = appearances.at(-1);

    characters.push({
      key: cluster.key,
      primaryName: cluster.primaryName,
      fullName: cluster.fullName,
      variants: cluster.variants,
      aliases: cluster.aliases,
      mentionCount: cluster.occurrences.length,
      dialogueMentions,
      sectionIds: appearances.map((appearance) => appearance.sectionId),
      firstSectionId: first?.sectionId ?? "",
      firstSectionTitle: first?.sectionTitle ?? "",
      lastSectionId: last?.sectionId ?? "",
      lastSectionTitle: last?.sectionTitle ?? "",
      role: classification.role,
      roleConfidence: classification.confidence,
      roleReason: classification.reason,
      confidence: cluster.confidence,
      mergeConfidence: cluster.mergeConfidence,
      notes: cluster.notes,
      suggestedFields: facts,
      relations: [],
      events: extractEventsForCharacter(cluster),
      appearances,
    });
  }

  // Las relaciones necesitan que todas las fichas estén resueltas.
  const characterByKey = new Map(characters.map((character) => [character.key, character]));
  for (const cluster of filtered) {
    const character = characterByKey.get(cluster.key);
    if (!character) continue;

    const relations: CharacterRelationCandidate[] = extractRelationsForCharacter(
      cluster,
      filtered,
    ).filter(
      (relation) => characterByKey.has(relation.fromKey) && characterByKey.has(relation.toKey),
    );
    character.relations = relations;
  }

  characters.sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      b.mentionCount - a.mentionCount ||
      a.primaryName.localeCompare(b.primaryName),
  );

  const factsByCharacter = new Map<string, CharacterFactCandidate[]>(
    characters.map((character) => [character.key, character.suggestedFields]),
  );
  const eventsByCharacter = new Map<string, CharacterEventCandidate[]>(
    characters.map((character) => [character.key, character.events]),
  );
  const occurrencesByCharacter = new Map<string, NameOccurrence[]>(
    filtered.map((cluster) => [cluster.key, cluster.occurrences]),
  );

  const alerts = detectContinuityAlerts(
    characters,
    factsByCharacter,
    eventsByCharacter,
    occurrencesByCharacter,
  );

  if (characters.length === 0) {
    warnings.push(
      "No se han detectado personajes con evidencia suficiente. Puedes crear fichas manualmente o revisar los nombres del manuscrito.",
    );
  }

  if (options.includeEngineNotice !== false) {
    warnings.push(
      "Análisis local y determinista: el manuscrito no se ha enviado a servicios de IA externos. Las clasificaciones y los datos son sugerencias que debes revisar.",
    );
  }

  const wordsAnalyzed = prepared.reduce((total, item) => total + item.info.wordCount, 0);
  if (wordsAnalyzed > 250_000) {
    warnings.push(
      "El manuscrito es extenso. El análisis se ha ejecutado por secciones; para textos muy grandes conviene revisar el resultado por capítulos.",
    );
  }

  return {
    characters,
    alerts,
    sections: prepared.map((item) => item.info),
    warnings,
    stats: {
      sectionsAnalyzed: prepared.length,
      wordsAnalyzed,
      candidateNames: new Set(occurrences.map((occurrence) => occurrence.normalized)).size,
      charactersDetected: characters.length,
      durationMs: Date.now() - startedAt,
    },
  };
}

/** Cita breve para una aparición, expuesta para pruebas y componentes. */
export function quoteForOccurrence(occurrence: NameOccurrence): string {
  return excerptFromSentence(
    {
      text: occurrence.sentenceText,
      start: occurrence.sentenceStart,
      end: occurrence.sentenceEnd,
      index: occurrence.sentenceIndex,
    },
    occurrence.start,
    occurrence.end,
    240,
  );
}
