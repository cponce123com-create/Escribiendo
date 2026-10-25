import type { CharacterCandidate, CharacterEvidence, NarrativeSection } from "./character-analysis";
import { ACTION_VERBS, extractNameOccurrences, PERSON_TITLES, SPEECH_VERBS } from "./engine/names";
import { splitSentences } from "./engine/text";
import type { NameOccurrence } from "./engine/types";
import {
  AMBIGUOUS_GIVEN,
  CHARACTER_NAME_VERIFICATION_VERSION,
  GIVEN_NAMES,
  isGivenName,
  lexicalName,
  NAME_PARTICLES,
  NON_PERSON_WORDS,
  personalIdentity,
  personalNameParts,
  SURNAMES,
} from "./personal-name";

export const CHARACTER_NAME_LIMITS = {
  sections: 200,
  totalCharacters: 8_000_000,
  sectionCharacters: 1_000_000,
  occurrences: 30_000,
  candidates: 500,
} as const;
interface VerifiedOccurrence {
  occurrence: NameOccurrence;
  identity: string;
  strong: boolean;
  reason: string;
}
function inspect(occurrence: NameOccurrence): VerifiedOccurrence | null {
  const name = occurrence.text.normalize("NFC"),
    parts = name.split(/\s+/u),
    lexical = parts.map(lexicalName);
  if (
    name.length > 160 ||
    parts.length > 7 ||
    !parts.every(
      (part, index) =>
        (index > 0 && NAME_PARTICLES.has(lexical[index]!)) ||
        /^(?:\p{Lu}[\p{L}\p{M}]*|\p{Lu}{2,})(?:[-'’]\p{L}[\p{L}\p{M}]*)?$/u.test(part),
    )
  )
    return null;
  if (
    lexical.some(
      (part) =>
        (NON_PERSON_WORDS.has(part) && !GIVEN_NAMES.has(part)) ||
        ACTION_VERBS.has(part) ||
        SPEECH_VERBS.has(part),
    )
  )
    return null;
  const start = occurrence.start - occurrence.sentenceStart,
    end = occurrence.end - occurrence.sentenceStart;
  const before = occurrence.sentenceText.slice(0, start),
    after = occurrence.sentenceText.slice(end);
  const beforeWords = lexicalName(before).match(/[\p{L}]+/gu) ?? [],
    afterWords = lexicalName(after).match(/[\p{L}]+/gu) ?? [];
  const speechBefore =
    /(?:dijo|dice|decía|preguntó|pregunta|respondió|respondía|contestó|susurró|gritó|murmuró|replicó|exclamó|añadió)\s+(?:(?:el|la|don|doña|señor|señora)\s+)?$/iu.test(
      before,
    );
  const speechAfter =
    /^\s*[,—–-]?\s*(?:dijo|dice|decía|preguntó|pregunta|respondió|respondía|contestó|susurró|gritó|murmuró|replicó|exclamó|añadió)(?![\p{L}])/iu.test(
      after,
    );
  const titled =
    PERSON_TITLES.has(beforeWords.at(-1) ?? "") &&
    !["san", "santa"].includes(beforeWords.at(-1) ?? "");
  const named =
    /(?:se llamaba|se llama|me llamo|su nombre era|su nombre es|llamado|llamada)\s*$/iu.test(
      before,
    );
  const strong = speechBefore || speechAfter || titled || named;
  if (
    /(?:empresa|banco|universidad|hospital|ministerio|municipalidad|editorial|organización|organizacion|colegio)\s+(?:de\s+)?$/iu.test(
      before,
    )
  )
    return null;
  if (
    !speechBefore &&
    !speechAfter &&
    !named &&
    (/^\s+(?:(?:es|era|fue)\s+(?:un|una|el|la)\s+(?:ciudad|pueblo|país|pais|distrito|provincia|localidad|barrio)|(?:queda|quedaba|se encuentra|está situado|esta situado)\s+en)\b/iu.test(
      after,
    ) ||
      /(?:\b(?:a|en|desde|hacia)\s+(?:san|santa)|\b(?:iglesia|hospital|colegio|plaza|universidad)\s+(?:(?:de|del)\s+)?(?:san|santa))\s*$/iu.test(
        before,
      ))
  )
    return null;

  // «La Luz» y «Banco Central» no adquieren identidad humana por estar capitalizados.
  if (/(?:^|\s)(?:el|la|los|las|un|una|unos|unas)\s*$/iu.test(before) && !strong) return null;
  if (occurrence.negativeCue && !strong) return null;
  const namedParts = personalNameParts(name),
    first = lexical[0]!;
  const knownGiven = isGivenName(first),
    surnameOnly = lexical.length === 1 && SURNAMES.has(first);
  const action = afterWords.slice(0, 2).some((word) => ACTION_VERBS.has(word));
  const knownSurname = lexical.some((part, index) => index > 0 && SURNAMES.has(part));
  if (!strong && !knownGiven && !(surnameOnly && action) && !(knownSurname && action)) return null;
  if (AMBIGUOUS_GIVEN.has(first) && !knownSurname && !strong) return null;
  if (!strong && !/[\p{L}\p{N}]/u.test(after + before)) return null;
  if (lexical.some((part) => NON_PERSON_WORDS.has(part) && !GIVEN_NAMES.has(part))) return null;
  return {
    occurrence,
    identity: personalIdentity(name),
    strong,
    reason: named
      ? "Declaración explícita de nombre"
      : speechBefore || speechAfter
        ? "Atribución de habla adyacente"
        : titled
          ? "Tratamiento de persona"
          : namedParts.surnames
            ? "Nombre y posible apellido en contexto narrativo"
            : "Nombre del léxico personal en contexto narrativo",
  };
}

/** Ida: formas/contexto. Vuelta: revisar cada aparición desde el final y contrastar identidad. */
export function verifyCharacterNamesResult(sections: readonly NarrativeSection[]): {
  candidates: CharacterCandidate[];
  limitsHit: string[];
} {
  const limitsHit = new Set<string>();
  if (sections.length > CHARACTER_NAME_LIMITS.sections) limitsHit.add("secciones");
  const forward: NameOccurrence[] = [];
  let characters = 0;
  for (const [index, section] of sections.slice(0, CHARACTER_NAME_LIMITS.sections).entries()) {
    const text = section.text.slice(
      0,
      Math.min(
        CHARACTER_NAME_LIMITS.sectionCharacters,
        CHARACTER_NAME_LIMITS.totalCharacters - characters,
      ),
    );
    characters += text.length;
    if (text.length < section.text.length) limitsHit.add("caracteres");
    if (!text) break;
    const sentences = splitSentences(text);
    forward.push(
      ...extractNameOccurrences(
        { id: section.id ?? `section-${index}`, title: section.title, order: index, content: text },
        sentences,
        { includeWeakCandidates: true },
      ).slice(0, CHARACTER_NAME_LIMITS.occurrences - forward.length),
    );
    if (forward.length >= CHARACTER_NAME_LIMITS.occurrences) {
      limitsHit.add("apariciones candidatas");
      break;
    }
  }
  const rawCounts = new Map<string, number>(),
    rawSeen = new Set<string>();
  const sentenceNames = new Map<string, Set<string>>();
  for (const occurrence of forward) {
    const key = `${occurrence.sectionId}:${occurrence.start}:${occurrence.end}`;
    if (rawSeen.has(key)) continue;
    rawSeen.add(key);
    const identity = personalIdentity(occurrence.text);
    rawCounts.set(identity, (rawCounts.get(identity) ?? 0) + 1);
    const sentenceKey = `${occurrence.sectionId}:${occurrence.sentenceStart}`,
      names = sentenceNames.get(sentenceKey) ?? new Set<string>();
    names.add(identity);
    sentenceNames.set(sentenceKey, names);
  }
  const reverse = new Map<string, VerifiedOccurrence[]>(),
    seen = new Set<string>();
  for (let i = forward.length - 1; i >= 0; i--) {
    const verified = inspect(forward[i]!);
    if (!verified) continue;
    const key = `${verified.occurrence.sectionId}:${verified.occurrence.start}:${verified.occurrence.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = reverse.get(verified.identity) ?? [];
    list.push(verified);
    reverse.set(verified.identity, list);
  }
  // Los nombres largos crean un índice de variantes; solo una identidad completa puede poseerlas.
  const owners = new Map<string, Set<string>>();
  for (const [identity, occurrences] of reverse) {
    const parts = personalNameParts(occurrences[0]!.occurrence.text);
    if (!parts.surnames) continue;
    const variants = [
      parts.givenNames,
      parts.givenNames.split(" ")[0]!,
      parts.surnames,
      parts.surnames.split(" ").find((part) => !NAME_PARTICLES.has(lexicalName(part))) ??
        parts.surnames,
    ];
    for (const variant of variants) {
      const key = personalIdentity(variant);
      if (key === identity) continue;
      const roots = owners.get(key) ?? new Set<string>();
      roots.add(identity);
      owners.set(key, roots);
    }
  }
  const resolved = new Map([...reverse].map(([key, list]) => [key, [...list]])),
    aliases = new Map<string, string[]>(),
    ambiguous = new Map<string, string[]>();
  for (const [variant, roots] of owners) {
    const mentions = reverse.get(variant);
    if (!mentions) continue;
    if (roots.size !== 1) {
      resolved.delete(variant);
      for (const root of roots)
        ambiguous.set(root, [...(ambiguous.get(root) ?? []), mentions[0]!.occurrence.text]);
      continue;
    }
    const root = [...roots][0]!;
    resolved.get(root)!.push(...mentions);
    resolved.delete(variant);
    aliases.set(root, [...(aliases.get(root) ?? []), mentions[0]!.occurrence.text]);
  }
  const results: CharacterCandidate[] = [];
  for (const [identity, mentions] of resolved) {
    if (mentions.length < 2) continue;
    const original = reverse.get(identity)!;
    const preferred = [...original].sort(
      (a, b) =>
        Number(b.strong) - Number(a.strong) ||
        a.occurrence.sectionOrder - b.occurrence.sectionOrder ||
        a.occurrence.start - b.occurrence.start,
    )[0]!;
    const name = preferred.occurrence.text.normalize("NFC"),
      parts = personalNameParts(name);
    // La vuelta debe encontrar dos apariciones distintas; no se cuentan tokens interiores como alias.
    const strongMentions = mentions.filter((item) => item.strong).length;
    const confidence = Math.min(
      0.96,
      0.72 +
        Math.min(0.08, (mentions.length - 2) * 0.02) +
        (strongMentions ? 0.08 : 0) +
        (parts.surnames ? 0.04 : 0),
    );
    const ordered = [
      preferred,
      ...mentions
        .filter((m) => m !== preferred)
        .sort(
          (a, b) =>
            a.occurrence.sectionOrder - b.occurrence.sectionOrder ||
            a.occurrence.start - b.occurrence.start,
        ),
    ];
    const evidence: CharacterEvidence[] = ordered.slice(0, 5).map(({ occurrence: o, strong }) => ({
      section: o.sectionTitle,
      sectionId: o.sectionId,
      nameUsed: o.text,
      excerpt: o.sentenceText.slice(
        Math.max(0, o.start - o.sentenceStart - 80),
        Math.min(o.sentenceText.length, o.end - o.sentenceStart + 180),
      ),
      confidence,
      kind: strong && o.hasSpeechCue ? "dialogue" : "entity",
    }));
    let age: string | undefined, description: string | undefined;
    for (const { occurrence: o } of ordered) {
      const tail = o.sentenceText.slice(o.end - o.sentenceStart);
      const ageMatch = /^\s*,?\s*(?:a sus|de|tenía|tiene|cumplió)\s+(\d{1,3})\s+años/iu.exec(tail);
      if (ageMatch && Number(ageMatch[1]) <= 125) age = ageMatch[1];
      if (
        /^\s+(?:tenía|tiene|era|es)\s+(?:(?![.!?]).){0,50}(?:ojos|cabello|pelo)\s+/iu.test(tail) &&
        ![...(sentenceNames.get(`${o.sectionId}:${o.sentenceStart}`) ?? [])].some(
          (key) =>
            key !== identity &&
            !(aliases.get(identity) ?? []).some((alias) => personalIdentity(alias) === key),
        )
      )
        description = o.sentenceText.slice(0, 500);
    }
    results.push({
      name,
      mentions: mentions.length,
      role: "SECONDARY",
      confidence,
      evidence,
      aliases: aliases.get(identity) ?? [],
      ...(age ? { age } : {}),
      ...(description ? { description } : {}),
      nameVerification: {
        ...parts,
        algorithm: CHARACTER_NAME_VERIFICATION_VERSION,
        forwardMentions: [identity, ...(aliases.get(identity) ?? []).map(personalIdentity)].reduce(
          (count, key) => count + (rawCounts.get(key) ?? 0),
          0,
        ),
        reverseMentions: mentions.length,
        strongPersonalMentions: strongMentions,
        ambiguousVariants: ambiguous.get(identity) ?? [],
        reasons: [...new Set(mentions.map((item) => item.reason))].slice(0, 5),
      },
    });
  }
  if (results.length > CHARACTER_NAME_LIMITS.candidates) limitsHit.add("personajes");
  return {
    limitsHit: [...limitsHit],
    candidates: results
      .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, "es"))
      .slice(0, CHARACTER_NAME_LIMITS.candidates),
  };
}

export function verifyCharacterNames(sections: readonly NarrativeSection[]): CharacterCandidate[] {
  return verifyCharacterNamesResult(sections).candidates;
}
