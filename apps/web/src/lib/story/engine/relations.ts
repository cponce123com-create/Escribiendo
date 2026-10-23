import type { CharacterRelationCandidate, RelationType } from "./types";
import type { NameCluster } from "./names";
import { normalizeName, stableKey } from "./text";
import { characterSentences } from "./facts";

const FAMILY_LABELS = [
  "madre",
  "padre",
  "hermano",
  "hermana",
  "hijo",
  "hija",
  "primo",
  "prima",
  "tío",
  "tia",
  "tía",
  "abuelo",
  "abuela",
  "bisabuelo",
  "bisabuela",
  "nieto",
  "nieta",
  "sobrino",
  "sobrina",
  "suegro",
  "suegra",
  "cuñado",
  "cuñada",
];

const FRIEND_LABELS = [
  "amigo",
  "amiga",
  "compañero",
  "companero",
  "compañera",
  "companera",
  "colega",
  "vecino",
  "vecina",
  "socio",
  "socia",
  "aliado",
  "aliada",
];

const ROMANCE_LABELS = [
  "esposo",
  "esposa",
  "marido",
  "mujer",
  "pareja",
  "novio",
  "novia",
  "prometido",
  "prometida",
];

const RIVAL_LABELS = ["rival", "enemigo", "enemiga"];

const ALL_LABELS = [...FAMILY_LABELS, ...FRIEND_LABELS, ...ROMANCE_LABELS, ...RIVAL_LABELS];

const NAME_PATTERN = String.raw`([\p{Lu}][\p{L}'’.-]*(?:\s+(?:de|del|la|las|los|y)?\s*[\p{Lu}][\p{L}'’.-]*){0,3})`;

const POSSESSIVE_RELATION = new RegExp(
  String.raw`\bsu\s+(${ALL_LABELS.join("|")})[,\s]+(?:(?:se\s+llamaba|se\s+llamaba|era|es|fue|llamado|llamada|de\s+nombre)\s+)?${NAME_PATTERN}`,
  "iu",
);

const REVERSE_RELATION = new RegExp(
  String.raw`${NAME_PATTERN}\s+(?:era|es|fue)\s+(?:su|el|la)\s+(${ALL_LABELS.join("|")})`,
  "iu",
);

const ROMANCE_RELATION = new RegExp(
  String.raw`\b(?:se\s+cas[oó]|se\s+divorci[oó]|estaba\s+casad[oa]|era\s+novi[oa]|se\s+enamor[oó]|viv[ií]a\s+con)\s+(?:con|de)\s+${NAME_PATTERN}`,
  "iu",
);

const GENERIC_RELATION = new RegExp(
  String.raw`\b(${ALL_LABELS.join("|")})\s+(?:de|del)\s+${NAME_PATTERN}`,
  "iu",
);

const COMPANION_RELATION = new RegExp(
  String.raw`\b(?:trabajaba|trabaja|viv[ií]a|vive|viaj[oó]|viaja|sali[oó]|sale)\s+con\s+${NAME_PATTERN}`,
  "iu",
);

interface ClusterLookup {
  exact: Map<string, NameCluster>;
  forms: Array<{ normalized: string; cluster: NameCluster }>;
}

function buildLookup(clusters: NameCluster[]): ClusterLookup {
  const exact = new Map<string, NameCluster>();
  const forms: Array<{ normalized: string; cluster: NameCluster }> = [];

  for (const cluster of clusters) {
    const normalizedForms = new Set([
      normalizeName(cluster.primaryName),
      ...(cluster.fullName ? [normalizeName(cluster.fullName)] : []),
      ...cluster.variants.map((variant) => normalizeName(variant)),
      ...cluster.occurrences.map((occurrence) => occurrence.normalized),
    ]);

    for (const normalized of normalizedForms) {
      if (!normalized) continue;
      forms.push({ normalized, cluster });
      if (cluster.primaryName && normalizeName(cluster.primaryName) === normalized) {
        exact.set(normalized, cluster);
      }
    }
  }

  return { exact, forms };
}

function resolveTarget(
  captured: string,
  lookup: ClusterLookup,
  from: NameCluster,
): NameCluster | null {
  const normalized = normalizeName(captured);
  if (!normalized) return null;

  const exact = lookup.exact.get(normalized);
  if (exact && exact.key !== from.key) return exact;

  const matches = new Set<NameCluster>();
  for (const form of lookup.forms) {
    if (form.cluster.key === from.key) continue;
    if (
      form.normalized === normalized ||
      normalized.startsWith(`${form.normalized} `) ||
      form.normalized.startsWith(`${normalized} `)
    ) {
      matches.add(form.cluster);
    }
  }

  return matches.size === 1 ? (Array.from(matches)[0] ?? null) : null;
}

function relationType(label: string): RelationType {
  const normalized = normalizeName(label);
  if (FAMILY_LABELS.includes(normalized)) return "FAMILY";
  if (ROMANCE_LABELS.includes(normalized)) return "ROMANCE";
  if (RIVAL_LABELS.includes(normalized))
    return normalized.startsWith("enemig") ? "CONFLICT" : "RIVALRY";
  if (
    normalized === "aliado" ||
    normalized === "aliada" ||
    normalized === "socio" ||
    normalized === "socia"
  ) {
    return "ALLIANCE";
  }
  if (FRIEND_LABELS.includes(normalized)) return "FRIEND";
  return "OTHER";
}

function displayLabel(label: string): string {
  const normalized = normalizeName(label);
  return `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
}

function addRelation(
  output: Map<string, CharacterRelationCandidate>,
  from: NameCluster,
  to: NameCluster,
  label: string,
  sentence: {
    text: string;
    start: number;
    sectionId: string;
    sectionTitle: string;
    sectionOrder: number;
  },
  matchIndex: number,
  confidence: number,
): void {
  const type = relationType(label);
  const pair = [from.key, to.key].sort().join(":");
  const key = `${pair}:${type}:${normalizeName(label)}`;
  const candidate: CharacterRelationCandidate = {
    fromKey: from.key,
    fromName: from.primaryName,
    toKey: to.key,
    toName: to.primaryName,
    type,
    label: displayLabel(label),
    excerpt: sentence.text,
    sectionId: sentence.sectionId,
    sectionTitle: sentence.sectionTitle,
    sectionOrder: sentence.sectionOrder,
    offset: sentence.start + Math.max(0, matchIndex),
    confidence: Math.min(0.9, confidence),
    source: "EXPLICIT",
  };

  const existing = output.get(key);
  if (!existing || existing.confidence < candidate.confidence) {
    output.set(key, candidate);
  }
}

/**
 * Relaciones explícitas que unen dos personajes ya detectados. Si el nombre
 * citado no se ha resuelto con seguridad, no se crea una relación inventada.
 */
export function extractRelationsForCharacter(
  from: NameCluster,
  allClusters: NameCluster[],
): CharacterRelationCandidate[] {
  const lookup = buildLookup(allClusters);
  const output = new Map<string, CharacterRelationCandidate>();

  for (const entry of characterSentences(from)) {
    const { sentence, occurrence } = entry;
    const context = {
      text: sentence.text,
      start: sentence.start,
      sectionId: occurrence.sectionId,
      sectionTitle: occurrence.sectionTitle,
      sectionOrder: occurrence.sectionOrder,
    };

    const possessive = POSSESSIVE_RELATION.exec(sentence.text);
    if (possessive?.[1] && possessive[2]) {
      const target = resolveTarget(possessive[2], lookup, from);
      if (target) {
        addRelation(output, from, target, possessive[1], context, possessive.index, 0.82);
      }
    }

    const reverse = REVERSE_RELATION.exec(sentence.text);
    if (reverse?.[1] && reverse[2]) {
      const target = resolveTarget(reverse[1], lookup, from);
      if (target) {
        addRelation(output, from, target, reverse[2], context, reverse.index, 0.78);
      }
    }

    const romance = ROMANCE_RELATION.exec(sentence.text);
    if (romance?.[1]) {
      const target = resolveTarget(romance[1], lookup, from);
      if (target) {
        addRelation(output, from, target, "pareja", context, romance.index, 0.72);
      }
    }

    const generic = GENERIC_RELATION.exec(sentence.text);
    if (generic?.[1] && generic[2]) {
      const target = resolveTarget(generic[2], lookup, from);
      if (target) {
        addRelation(output, from, target, generic[1], context, generic.index, 0.8);
      }
    }

    const companion = COMPANION_RELATION.exec(sentence.text);
    if (companion?.[1]) {
      const target = resolveTarget(companion[1], lookup, from);
      if (target) {
        addRelation(output, from, target, "compañero", context, companion.index, 0.66);
      }
    }
  }

  return Array.from(output.values()).sort(
    (a, b) => b.confidence - a.confidence || a.sectionOrder - b.sectionOrder,
  );
}

export function relationStableKey(fromName: string, toName: string, type: RelationType): string {
  return stableKey(`${[fromName, toName].sort().join("|")}|${type}`);
}
