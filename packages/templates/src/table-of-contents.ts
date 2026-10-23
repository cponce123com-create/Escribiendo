import { z } from "zod";

/**
 * Índice automático.
 *
 * El índice no se escribe: se deriva de la estructura del manuscrito y de las
 * páginas que produce el motor de composición. Este módulo no pagina ni mide
 * fuentes; recibe entradas ya ordenadas y etiquetas de página ya calculadas.
 *
 * Regla de oro: un número de página solo se muestra si procede de una
 * composición real. En formatos refluibles (EPUB) la etiqueta es `null` y la
 * navegación es semántica.
 */

export const tocDepths = [
  "parts-chapters",
  "chapters-h1",
  "chapters-h1-h2",
  "chapters-h1-h2-h3",
] as const;

export type TocDepth = (typeof tocDepths)[number];

export const tocDepthSchema = z.enum(tocDepths);

export const DEFAULT_TOC_DEPTH: TocDepth = "chapters-h1";

export function isTocDepth(value: unknown): value is TocDepth {
  return typeof value === "string" && (tocDepths as readonly string[]).includes(value);
}

/** Profundidad máxima de las entradas, contando niveles desde 0. */
export function tocMaxLevel(depth: TocDepth): number {
  switch (depth) {
    case "parts-chapters":
      return 1;
    case "chapters-h1":
      return 1;
    case "chapters-h1-h2":
      return 2;
    case "chapters-h1-h2-h3":
      return 3;
  }
}

/** `parts-chapters` incluye las partes; el resto empieza en el primer capítulo. */
export function tocIncludesParts(depth: TocDepth): boolean {
  return depth === "parts-chapters";
}

export type TocGroup = "front" | "body" | "back";

export interface TocSource {
  id: string;
  title: string;
  /** 0 = parte, 1 = capítulo, 2 = subcapítulo, 3 = apartado. */
  level: number;
  group: TocGroup;
  /** Respeta el interruptor «mostrar en índice» de la sección. */
  showInToc: boolean;
  includeInExport?: boolean;
  enabled?: boolean;
  /** Número de página física ya compuesta, si existe. */
  pageIndex?: number;
  /** Etiqueta ya calculada; tiene prioridad sobre `pageIndex`. */
  pageLabel?: string | null;
}

export interface TocEntry {
  sourceId: string;
  title: string;
  level: number;
  group: TocGroup;
  pageIndex?: number;
  label: string | null;
}

export interface BuildTocOptions {
  depth: TocDepth;
  /** Incluye las materias de preliminares y finales que estén marcadas. */
  includeFrontMatter?: boolean;
  includeBackMatter?: boolean;
  /** Un título vacío se omite en lugar de imprimir una línea huérfana. */
  skipEmptyTitles?: boolean;
}

function normalizedTitle(title: string | null | undefined): string {
  return (title ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Convierte la lista canónica de secciones en entradas de índice.
 *
 * Conserva el orden recibido: el llamador debe pasar las secciones en el
 * orden editorial (`editorialOrder`), nunca en orden de creación.
 */
export function buildTocEntries(
  sources: readonly TocSource[],
  options: BuildTocOptions,
): TocEntry[] {
  const maxLevel = tocMaxLevel(options.depth);
  const includeParts = tocIncludesParts(options.depth);
  const includeFront = options.includeFrontMatter ?? true;
  const includeBack = options.includeBackMatter ?? true;
  const skipEmpty = options.skipEmptyTitles ?? true;

  const entries: TocEntry[] = [];

  for (const source of sources) {
    if (!source.showInToc || source.enabled === false || source.includeInExport === false) {
      continue;
    }
    if (source.group === "front" && !includeFront) {
      continue;
    }
    if (source.group === "back" && !includeBack) {
      continue;
    }
    if (source.group === "body") {
      if (!includeParts && source.level === 0) {
        continue;
      }
      if (source.level > maxLevel) {
        continue;
      }
    }

    const title = normalizedTitle(source.title);
    if (!title && skipEmpty) {
      continue;
    }

    entries.push({
      sourceId: source.id,
      title,
      level: source.level,
      group: source.group,
      pageIndex: source.pageIndex,
      label: source.pageLabel ?? null,
    });
  }

  return entries;
}

/**
 * Etiquetas disponibles por identificador de sección.
 *
 * Se pasan desde la composición real. Si una sección no tiene etiqueta, el
 * índice muestra la línea sin número antes que inventarlo.
 */
export function assignTocLabels(
  entries: readonly TocEntry[],
  labelsBySource: ReadonlyMap<string, string>,
): TocEntry[] {
  return entries.map((entry) => ({
    ...entry,
    label: entry.label ?? labelsBySource.get(entry.sourceId) ?? null,
  }));
}

export type FolioStyle = "arabic" | "roman" | "none";

export interface PageLabelOptions {
  /** Índice físico de la página, empezando en 0. */
  pageIndex: number;
  /** Páginas ocupadas por los preliminares. */
  frontMatterPages: number;
  frontMatterStyle: FolioStyle;
  /** Primer número visible del cuerpo. Por defecto 1. */
  bodyStartNumber?: number;
  /** Primer número visible de los preliminares. Por defecto 1. */
  frontMatterStartNumber?: number;
  /** Si los preliminares no imprimen folio, su etiqueta es `null`. */
  showFrontMatterFolios?: boolean;
  frontMatterLowerCase?: boolean;
}

/** Números romanos para folios de preliminares (1–3999). */
export function romanNumeral(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) {
    throw new RangeError(`El folio romano debe estar entre 1 y 3999; recibido: ${value}.`);
  }

  const table: ReadonlyArray<readonly [number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  let remaining = value;
  let result = "";
  for (const [amount, numeral] of table) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

export function formatFolio(value: number, style: FolioStyle, lowerCase = false): string | null {
  if (style === "none" || value < 1) {
    return null;
  }
  if (style === "roman") {
    const numeral = romanNumeral(value);
    return lowerCase ? numeral.toLowerCase() : numeral;
  }
  return String(value);
}

/**
 * Etiqueta visible de una página.
 *
 * El cuerpo reinicia la numeración; los preliminares pueden usar romanos y
 * ocultarse del folio impreso. El folio físico del motor no cambia.
 */
export function pageLabel(options: PageLabelOptions): string | null {
  const bodyStart = options.bodyStartNumber ?? 1;
  const frontStart = options.frontMatterStartNumber ?? 1;
  const frontPages = Math.max(0, options.frontMatterPages);

  if (options.pageIndex < 0) {
    return null;
  }

  if (options.pageIndex < frontPages) {
    if (options.showFrontMatterFolios === false || options.frontMatterStyle === "none") {
      return null;
    }
    return formatFolio(
      frontStart + options.pageIndex,
      options.frontMatterStyle,
      options.frontMatterLowerCase ?? true,
    );
  }

  return formatFolio(bodyStart + (options.pageIndex - frontPages), "arabic");
}

/**
 * Puntos guía entre título y folio.
 *
 * Es una aproximación para texto no monoespaciado: el renderizador decide la
 * fuente y puede sustituirla por un líder tipográfico real. Nunca devuelve
 * menos de un punto cuando hay etiqueta.
 */
export function tocLeaderDots(title: string, label: string | null, widthChars = 60): number {
  if (!label) {
    return 0;
  }
  const available = Math.max(1, Math.floor(widthChars) - title.length - label.length - 2);
  return Math.max(1, available);
}

export interface TocLine {
  title: string;
  label: string | null;
  leaderDots: number;
}

export function formatTocLine(
  entry: Pick<TocEntry, "title" | "label">,
  widthChars = 60,
): TocLine {
  return {
    title: entry.title,
    label: entry.label,
    leaderDots: tocLeaderDots(entry.title, entry.label, widthChars),
  };
}

/** Firma estable para detectar si el índice cambió entre pasadas. */
export function tocSignature(entries: readonly TocEntry[]): string {
  return entries.map((entry) => `${entry.sourceId}:${entry.level}:${entry.label ?? "-"}`).join("|");
}

export interface TocPaginationAttempt {
  entries: TocEntry[];
  pageCount: number;
  signature: string;
}

export interface TocStabilizationOptions {
  /** Páginas que ocupa el índice en la primera pasada. */
  initialTocPages: number;
  /** Máximo de pasadas antes de rendirse. */
  maxPasses?: number;
  /**
   * Compone el libro con un índice de `tocPages` páginas y devuelve el índice
   * recalculado junto con las páginas totales que ocupa.
   */
  layout: (tocPages: number) => TocPaginationAttempt;
}

export interface TocStabilizationResult {
  entries: TocEntry[];
  tocPages: number;
  passes: number;
  converged: boolean;
}

/**
 * Itera hasta que el índice deja de moverse.
 *
 * Un índice puede crecer al añadir páginas y desplazar los capítulos, que a su
 * vez cambian las páginas del índice. Se acota el número de pasadas y se
 * informa `converged: false` para que la interfaz muestre una advertencia en
 * lugar de un resultado inestable.
 */
export function stabilizeToc(options: TocStabilizationOptions): TocStabilizationResult {
  const maxPasses = Math.max(1, options.maxPasses ?? 5);
  let tocPages = Math.max(0, options.initialTocPages);
  let signature = "";
  let entries: TocEntry[] = [];

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const attempt = options.layout(tocPages);
    entries = attempt.entries;
    const nextSignature = attempt.signature || tocSignature(attempt.entries);
    const pagesChanged = attempt.pageCount !== tocPages;
    const entriesChanged = nextSignature !== signature;

    tocPages = attempt.pageCount;

    if (!pagesChanged && !entriesChanged) {
      return { entries, tocPages, passes: pass, converged: true };
    }

    signature = nextSignature;
  }

  return { entries, tocPages, passes: maxPasses, converged: false };
}

export interface TocWarning {
  code: string;
  message: string;
  sourceId?: string;
}

/** Avisos que no impiden componer, pero que el editor debe ver. */
export function auditToc(
  entries: readonly TocEntry[],
  options: { hasBodySections: boolean; depth: TocDepth; expectedMinimum?: number },
): TocWarning[] {
  const warnings: TocWarning[] = [];
  const seen = new Map<string, TocEntry>();

  for (const entry of entries) {
    if (!entry.title) {
      warnings.push({
        code: "ENTRADA_SIN_TITULO",
        message: "Hay una entrada de índice sin título.",
        sourceId: entry.sourceId,
      });
    }
    const key = `${entry.level}:${entry.title.toLocaleLowerCase("es")}`;
    const previous = seen.get(key);
    if (previous) {
      warnings.push({
        code: "ENTRADA_DUPLICADA",
        message: `«${entry.title}» aparece más de una vez en el mismo nivel del índice.`,
        sourceId: entry.sourceId,
      });
    } else {
      seen.set(key, entry);
    }
  }

  if (options.hasBodySections && entries.length === 0) {
    warnings.push({
      code: "INDICE_VACIO",
      message: "El libro tiene secciones, pero ninguna quedó incluida en el índice.",
    });
  }

  const minimum = options.expectedMinimum ?? 1;
  if (options.hasBodySections && entries.length > 0 && entries.length < minimum) {
    warnings.push({
      code: "INDICE_CORTO",
      message: "El índice tiene menos entradas de las esperadas para este tipo de obra.",
    });
  }

  if (options.depth === "parts-chapters" && entries.every((entry) => entry.level !== 0)) {
    warnings.push({
      code: "SIN_PARTES",
      message: "Se eligió índice por partes, pero el libro no tiene partes.",
    });
  }

  return warnings;
}
