import { escapeMarkdownText } from "@escribiendo/export-engine";

/**
 * Markdown de la biblia de la historia.
 *
 * Es un documento aparte del manuscrito: no pasa por el motor de exportación
 * del libro ni genera un trabajo de exportación. Se construye con datos ya
 * traducidos para que sea puro y verificable, y ordena todo por nombre para que
 * dos ejecuciones sobre el mismo libro den exactamente el mismo texto.
 */

export interface BibleEntry {
  name: string;
  aliases: readonly string[];
  /** Nombre del campo que describe la entrada: «Papel» o «Tipo». */
  labelTitle: string;
  /** Valor ya traducido de ese campo. */
  label: string;
  summary: string | null;
}

export interface BibleRelation {
  from: string;
  to: string;
  label: string;
  description: string | null;
}

export interface BiblePlanItem {
  title: string;
  kindLabel: string;
  statusLabel: string;
  summary: string | null;
}

export interface StoryBibleInput {
  bookTitle: string;
  characters: readonly BibleEntry[];
  worlds: readonly BibleEntry[];
  planItems: readonly BiblePlanItem[];
  relations: readonly BibleRelation[];
  /** Fichas que no aparecen en ninguna sección con texto. */
  missing: readonly string[];
}

/** Salto de línea, sin depender de secuencias de escape en el código fuente. */
const NEWLINE = String.fromCharCode(10);

/** Tres o más saltos seguidos se colapsan en una sola línea en blanco. */
const EMPTY_LINE_RUN = new RegExp(`${NEWLINE}{3}`, "gu");

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");

function entryLines(entry: BibleEntry): string[] {
  const lines = [`### ${escapeMarkdownText(entry.name)}`, ""];

  lines.push(`- ${entry.labelTitle}: ${escapeMarkdownText(entry.label)}`);

  if (entry.aliases.length > 0) {
    lines.push(`- Alias: ${entry.aliases.map(escapeMarkdownText).join(", ")}`);
  }

  if (entry.summary) {
    lines.push(`- ${escapeMarkdownText(entry.summary)}`);
  }

  lines.push("");
  return lines;
}

function section(title: string, body: string[]): string[] {
  return [`## ${title}`, "", ...body];
}

export function buildStoryBibleMarkdown(input: StoryBibleInput): string {
  const lines: string[] = [`# Biblia de la historia — ${escapeMarkdownText(input.bookTitle)}`, ""];

  const characters = [...input.characters].sort(byName);
  lines.push(
    ...section(
      "Personajes",
      characters.length === 0 ? ["_Sin fichas de personaje._", ""] : characters.flatMap(entryLines),
    ),
  );

  const worlds = [...input.worlds].sort(byName);
  lines.push(
    ...section(
      "Mundos y objetos",
      worlds.length === 0 ? ["_Sin fichas de mundo._", ""] : worlds.flatMap(entryLines),
    ),
  );

  const planItems = [...input.planItems].sort(
    (a, b) => a.kindLabel.localeCompare(b.kindLabel, "es") || a.title.localeCompare(b.title, "es"),
  );
  lines.push(
    ...section(
      "Trama",
      planItems.length === 0
        ? ["_Sin ideas ni escenas planificadas._", ""]
        : planItems.flatMap((item) => [
            `- **${escapeMarkdownText(item.title)}** · ${escapeMarkdownText(
              item.kindLabel,
            )} · ${escapeMarkdownText(item.statusLabel)}${
              item.summary ? ` — ${escapeMarkdownText(item.summary)}` : ""
            }`,
          ]),
    ),
  );

  if (planItems.length > 0) lines.push("");

  const relations = [...input.relations].sort(
    (a, b) => a.from.localeCompare(b.from, "es") || a.to.localeCompare(b.to, "es"),
  );
  lines.push(
    ...section(
      "Relaciones",
      relations.length === 0
        ? ["_Sin relaciones registradas._", ""]
        : relations.flatMap((relation) => [
            `- **${escapeMarkdownText(relation.from)}** — **${escapeMarkdownText(
              relation.to,
            )}**: ${escapeMarkdownText(relation.label)}${
              relation.description ? `. ${escapeMarkdownText(relation.description)}` : ""
            }`,
          ]),
    ),
  );

  if (relations.length > 0) lines.push("");

  lines.push(
    ...section(
      "Sin menciones",
      input.missing.length === 0
        ? ["Todas las fichas aparecen al menos una vez en el manuscrito.", ""]
        : [
            "Estas fichas no se mencionan en ninguna sección con texto. Puede que todavía no hayan entrado en el libro o que se nombren con una variante que no está registrada:",
            "",
            ...input.missing
              .map((name) => `- ${escapeMarkdownText(name)}`)
              .sort((a, b) => a.localeCompare(b, "es")),
            "",
          ],
    ),
  );

  const text = lines
    .join(NEWLINE)
    .replace(EMPTY_LINE_RUN, NEWLINE + NEWLINE)
    .trimEnd();

  return `${text}${NEWLINE}`;
}
