/**
 * Detección de menciones de entidades conocidas en el manuscrito.
 *
 * A diferencia del análisis de personajes —que descubre nombres nuevos—, este
 * módulo parte de las fichas que el autor ya tiene (personajes y mundos) y
 * responde a una pregunta concreta: ¿dónde se menciona cada una? Es la base de
 * la cobertura de la biblia de la historia y de las propuestas de vinculación.
 *
 * El criterio es conservador, porque un falso positivo erosiona la confianza:
 *
 * - Solo nombres de tres caracteres o más (las iniciales generan ruido).
 * - Coincidencia completa, con límites de palabra Unicode: «Ana» no coincide
 *   dentro de «Anabel».
 * - Insensible a mayúsculas y a tildes: «Alvaro» encuentra «Álvaro».
 * - Los nombres más largos se resuelven primero y consumen su tramo, de modo
 *   que «Ana María» no cuenta además como «Ana».
 */

export type MentionEntityKind = "CHARACTER" | "WORLD";

export interface MentionEntity {
  id: string;
  name: string;
  kind: MentionEntityKind;
  aliases?: readonly string[];
}

export interface MentionSection {
  id: string;
  title: string;
  order: number;
  text: string;
}

export interface MentionHit {
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  count: number;
  excerpt: string;
}

export interface EntityMentionProposal {
  entityId: string;
  entityName: string;
  kind: MentionEntityKind;
  /** Variantes que han aparecido, en orden de primera coincidencia. */
  matchedNames: string[];
  total: number;
  sections: MentionHit[];
}

/** Nombres por debajo de esta longitud se ignoran. */
export const MIN_MENTION_NAME_LENGTH = 3;

const EXCERPT_RADIUS = 110;

/** Barra invertida literal, para componer fragmentos de expresión regular. */
const BACKSLASH = String.fromCharCode(92);
const SPACE_RUN = `${BACKSLASH}s+`;
const WORD_CHAR = `${BACKSLASH}p{L}${BACKSLASH}p{N}`;

const ACCENT_GROUPS: Record<string, string> = {
  a: "aáàâäã",
  e: "eéèêë",
  i: "iíìîï",
  o: "oóòôöõ",
  u: "uúùûü",
  n: "nñ",
  c: "cç",
};

const REGEX_SPECIALS = new Set([
  ".",
  "*",
  "+",
  "?",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  "&",
  "-",
]);

function normalizeLetter(char: string): string {
  return char
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es");
}

/** Patrón tolerante a tildes y a variantes de escritura del nombre. */
export function flexibleTerm(name: string): string {
  return [...name.trim()]
    .map((char) => {
      if (/\s/u.test(char)) return SPACE_RUN;
      const base = normalizeLetter(char);
      const choices = ACCENT_GROUPS[base];
      if (choices) {
        return `[${choices}${choices.toUpperCase()}]`;
      }
      return REGEX_SPECIALS.has(char) ? `${String.fromCharCode(92)}${char}` : char;
    })
    .join("");
}

function excerptAround(text: string, start: number, end: number): string {
  return text
    .slice(Math.max(0, start - EXCERPT_RADIUS), Math.min(text.length, end + EXCERPT_RADIUS))
    .replace(/\s+/gu, " ")
    .trim();
}

function candidateNames(entity: MentionEntity, minLength: number): string[] {
  const names = [entity.name, ...(entity.aliases ?? [])]
    .map((name) => name.trim())
    .filter((name) => [...name].length >= minLength);

  const unique = new Map<string, string>();
  for (const name of names) {
    const key = normalizeLetter(name);
    if (!unique.has(key)) unique.set(key, name);
  }

  return [...unique.values()].sort((a, b) => b.length - a.length);
}

/**
 * Devuelve una propuesta por entidad con al menos una mención.
 *
 * No persiste nada: quien llama decide si crea vínculos, eventos o ninguna
 * acción. Las secciones sin texto se ignoran.
 */
export function detectEntityMentions(
  entities: readonly MentionEntity[],
  sections: readonly MentionSection[],
  options: { minNameLength?: number } = {},
): EntityMentionProposal[] {
  const minLength = Math.max(1, options.minNameLength ?? MIN_MENTION_NAME_LENGTH);
  const ordered = [...sections]
    .filter((section) => section.text.trim().length > 0)
    .sort((a, b) => a.order - b.order);

  const proposals: EntityMentionProposal[] = [];

  for (const entity of entities) {
    const names = candidateNames(entity, minLength);
    if (names.length === 0) continue;

    const patterns = names.map((name) => ({
      name,
      pattern: new RegExp(`(?<![${WORD_CHAR}])${flexibleTerm(name)}(?![${WORD_CHAR}])`, "giu"),
    }));

    const hits: MentionHit[] = [];
    const matchedNames: string[] = [];
    let total = 0;

    for (const section of ordered) {
      // Se van consumiendo los tramos ya contados para no sumar dos veces la
      // misma mención cuando un nombre contiene a otro.
      let remaining = section.text;
      let count = 0;
      let excerpt = "";

      for (const { name, pattern } of patterns) {
        for (const match of remaining.matchAll(pattern)) {
          const start = match.index ?? 0;
          const end = start + match[0].length;
          if (!excerpt) excerpt = excerptAround(remaining, start, end);
          count += 1;
          if (!matchedNames.includes(name)) matchedNames.push(name);
          remaining = `${remaining.slice(0, start)}${" ".repeat(end - start)}${remaining.slice(end)}`;
        }
      }

      if (count > 0) {
        total += count;
        hits.push({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionOrder: section.order,
          count,
          excerpt,
        });
      }
    }

    if (total === 0) continue;

    proposals.push({
      entityId: entity.id,
      entityName: entity.name,
      kind: entity.kind,
      matchedNames,
      total,
      sections: hits,
    });
  }

  return proposals.sort(
    (a, b) => b.total - a.total || a.entityName.localeCompare(b.entityName, "es"),
  );
}
