/**
 * Arco de apariciones de un personaje.
 *
 * Convierte la lista de secciones del libro y las secciones donde aparece un
 * personaje en una línea temporal con huecos explícitos. Es la base de dos
 * cosas: la vista de arco y las alertas de ausencia. El cálculo es puro y no
 * depende de la base de datos, para poder probarlo sin manuscrito real.
 *
 * Las reglas son deliberadamente prudentes: un personaje puede desaparecer a
 * propósito durante varios capítulos. Por eso las alertas son informativas y
 * nunca afirman que haya un error.
 */

export interface TimelineSection {
  id: string;
  title: string;
  /** Posición editorial dentro del libro; se ordena de menor a mayor. */
  order: number;
}

export interface TimelineAppearance {
  sectionId: string;
  /** Menciones dentro de la sección; por defecto, una. */
  count?: number;
}

export interface TimelinePoint {
  sectionId: string;
  title: string;
  /** Índice dentro de la línea temporal, desde cero. */
  index: number;
  count: number;
}

export interface TimelineGap {
  /** Índice de la sección anterior al hueco. */
  afterIndex: number;
  /** Índice de la sección posterior al hueco. */
  beforeIndex: number;
  /** Secciones intermedias sin aparición. */
  missing: number;
  fromTitle: string;
  toTitle: string;
}

export interface AppearanceTimeline {
  sections: Array<{ id: string; title: string; index: number }>;
  points: TimelinePoint[];
  gaps: TimelineGap[];
  /** Ausencia final, si el personaje deja de aparecer antes del final. */
  trailing: { lastIndex: number; missing: number } | null;
  /** Proporción de secciones con aparición, entre 0 y 1. */
  coverage: number;
}

export interface AppearanceAlert {
  kind: "ABSENCE" | "DISAPPEARS";
  message: string;
  evidence: string;
  section: string;
  severity: "INFO";
}

/** Huecos menores que este número de secciones no se señalan. */
export const DEFAULT_APPEARANCE_GAP = 3;

function orderedSections(sections: readonly TimelineSection[]): TimelineSection[] {
  const seen = new Set<string>();
  return [...sections]
    .filter((section) => {
      if (seen.has(section.id)) return false;
      seen.add(section.id);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "es"));
}

function internalGaps(points: readonly TimelinePoint[], threshold: number): TimelineGap[] {
  const gaps: TimelineGap[] = [];

  for (let position = 1; position < points.length; position += 1) {
    const previous = points[position - 1];
    const current = points[position];
    if (!previous || !current) continue;

    const missing = current.index - previous.index - 1;
    if (missing >= threshold) {
      gaps.push({
        afterIndex: previous.index,
        beforeIndex: current.index,
        missing,
        fromTitle: previous.title,
        toTitle: current.title,
      });
    }
  }

  return gaps;
}

export function buildAppearanceTimeline(
  sections: readonly TimelineSection[],
  appearances: readonly TimelineAppearance[],
  options: { gapThreshold?: number } = {},
): AppearanceTimeline {
  const ordered = orderedSections(sections);
  const indexById = new Map(ordered.map((section, index) => [section.id, index]));
  const bySection = new Map<string, number>();

  for (const appearance of appearances) {
    if (!indexById.has(appearance.sectionId)) continue;
    const count = Math.max(1, appearance.count ?? 1);
    bySection.set(appearance.sectionId, (bySection.get(appearance.sectionId) ?? 0) + count);
  }

  const points: TimelinePoint[] = [...bySection.entries()]
    .map(([sectionId, count]) => {
      const index = indexById.get(sectionId) ?? 0;
      return {
        sectionId,
        title: ordered[index]?.title ?? "",
        index,
        count,
      };
    })
    .sort((a, b) => a.index - b.index);

  const threshold = Math.max(1, options.gapThreshold ?? DEFAULT_APPEARANCE_GAP);
  const last = points.at(-1);
  const trailing =
    last && ordered.length - 1 - last.index >= threshold
      ? { lastIndex: last.index, missing: ordered.length - 1 - last.index }
      : null;

  return {
    sections: ordered.map((section, index) => ({ id: section.id, title: section.title, index })),
    points,
    gaps: internalGaps(points, threshold),
    trailing,
    coverage: ordered.length === 0 ? 0 : points.length / ordered.length,
  };
}

function quote(title: string): string {
  return `«${title || "Sin título"}»`;
}

/**
 * Alertas informativas derivadas del arco.
 *
 * No se emiten si el personaje solo aparece una vez: en ese caso la ausencia
 * no dice nada sobre la continuidad. Los huecos se recalculan con el umbral
 * recibido, para que la alerta y la vista compartan el mismo criterio.
 */
export function detectAppearanceAlerts(
  characterName: string,
  timeline: AppearanceTimeline,
  options: { gapThreshold?: number } = {},
): AppearanceAlert[] {
  if (timeline.points.length < 2) return [];

  const threshold = Math.max(1, options.gapThreshold ?? DEFAULT_APPEARANCE_GAP);
  const name = characterName.trim() || "El personaje";
  const alerts: AppearanceAlert[] = [];

  for (const gap of internalGaps(timeline.points, threshold)) {
    alerts.push({
      kind: "ABSENCE",
      message: `${name} no aparece entre ${quote(gap.fromTitle)} y ${quote(
        gap.toTitle,
      )}: ${gap.missing} secciones sin menciones.`,
      evidence: `Tramo sin apariciones entre las posiciones ${gap.afterIndex + 1} y ${
        gap.beforeIndex + 1
      }.`,
      section: `${quote(gap.fromTitle)} → ${quote(gap.toTitle)}`,
      severity: "INFO",
    });
  }

  const last = timeline.points.at(-1);
  const trailingMissing = last ? timeline.sections.length - 1 - last.index : 0;

  if (last && trailingMissing >= threshold) {
    alerts.push({
      kind: "DISAPPEARS",
      message: `${name} deja de aparecer tras ${quote(
        last.title,
      )}: ${trailingMissing} secciones sin volver a mencionarlo.`,
      evidence: "Puede ser el final de su arco; confirma que no falta una escena.",
      section: quote(last.title),
      severity: "INFO",
    });
  }

  return alerts;
}
