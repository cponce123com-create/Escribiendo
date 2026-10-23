import type { TiptapDocument, TiptapNode } from "@escribiendo/book-schema";
import { SECTION_TYPE_LABELS } from "@/lib/ui/format";

/**
 * Título editorial de una sección.
 *
 * El título que se escribe en el panel de capítulos es contenido del libro, no
 * solo un dato de navegación. Esta pieza decide si hay que insertarlo como
 * bloque y evita duplicarlo cuando el manuscrito ya empieza con un encabezado
 * equivalente.
 */

/** Texto plano de un nodo, sin marcas ni atributos. */
export function nodeText(node: TiptapNode): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.content ?? []).map(nodeText).join("");
}

/**
 * Normaliza un título para compararlo sin depender de mayúsculas, tildes,
 * comillas ni puntuación de separación.
 */
export function normalizeSectionTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Comprueba si el manuscrito ya abre con un encabezado equivalente al título
 * de la sección.
 *
 * Se examina el primer nodo con texto. Los párrafos vacíos y los separadores
 * no cuentan: si el autor ha dejado una línea en blanco antes del encabezado,
 * la deduplicación tiene que seguir funcionando.
 */
export function startsWithEquivalentHeading(document: TiptapDocument, title: string): boolean {
  const buscado = normalizeSectionTitle(title);

  if (buscado.length === 0) {
    return false;
  }

  for (const node of document.content) {
    const texto = nodeText(node).trim();

    if (texto.length === 0) {
      continue;
    }

    if (node.type !== "heading") {
      return false;
    }

    return normalizeSectionTitle(texto) === buscado;
  }

  return false;
}

/**
 * Título que debe mostrarse en el cuerpo.
 *
 * Un título vacío no genera bloque. Si el contenido ya empieza con el mismo
 * encabezado, tampoco: el autor no debe ver dos veces el mismo título.
 */
export function displayTitleForSection(
  title: string,
  document: TiptapDocument | null,
  alternativas: readonly string[] = [],
): string | null {
  const limpio = title.trim();

  if (limpio.length === 0) {
    return null;
  }

  if (
    document &&
    [limpio, ...alternativas].some((candidate) => startsWithEquivalentHeading(document, candidate))
  ) {
    return null;
  }

  return limpio;
}

/** Datos mínimos que necesita la composición del título visible. */
export interface SectionTitleInput {
  id: string;
  title: string;
  type: string;
  showTitle: boolean;
  showSectionType: boolean;
  showSectionNumber: boolean;
}

/**
 * Compone el título visible con la etiqueta y el número que haya elegido el
 * autor. El número es correlativo dentro del tipo: los capítulos no se
 * numeran contando prólogos o epílogos.
 *
 * Si el autor ya escribió la etiqueta en el título, no se repite.
 */
export function composeSectionTitle(
  section: SectionTitleInput,
  number?: number,
): string | null {
  if (!section.showTitle) {
    return null;
  }

  const title = section.title.trim();
  const label = section.showSectionType
    ? (SECTION_TYPE_LABELS[section.type] ?? "").trim()
    : "";
  const numberText =
    section.showSectionNumber && number !== undefined && number > 0 ? String(number) : "";
  const prefix = [label, numberText].filter(Boolean).join(" ");

  if (prefix.length === 0) {
    return title || null;
  }

  if (title.length === 0) {
    return prefix;
  }

  const titleNormalized = normalizeSectionTitle(title);
  const labelNormalized = normalizeSectionTitle(label);

  if (labelNormalized.length > 0 && titleNormalized.startsWith(labelNormalized)) {
    return title;
  }

  return `${prefix} — ${title}`;
}

/**
 * Calcula el título visible de cada sección en orden de lectura.
 *
 * El mapa se comparte entre la vista previa, el PDF, el EPUB y el DOCX para
 * que los cuatro caminos no numeren ni compongan de forma distinta.
 */
export function sectionDisplayTitles(
  sections: readonly SectionTitleInput[],
): Map<string, string | null> {
  const counters = new Map<string, number>();
  const titles = new Map<string, string | null>();

  for (const section of sections) {
    const countable = section.type === "CHAPTER" || section.type === "PART";
    const next = countable ? (counters.get(section.type) ?? 0) + 1 : undefined;

    if (countable && next !== undefined) {
      counters.set(section.type, next);
    }

    titles.set(section.id, composeSectionTitle(section, next));
  }

  return titles;
}
