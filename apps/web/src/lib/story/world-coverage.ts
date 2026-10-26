import {
  buildAppearanceTimeline,
  detectAppearanceAlerts,
  type AppearanceAlert,
  type AppearanceTimeline,
} from "./appearance-timeline";
import {
  detectEntityMentions,
  type MentionEntity,
  type MentionHit,
  type MentionSection,
} from "./entity-mentions";

/**
 * Cobertura de los mundos en el manuscrito.
 *
 * Es el hermano de `buildAppearanceTimeline` para personajes: reutiliza la
 * misma detección de menciones y el mismo cálculo de huecos, de modo que un
 * lugar y un personaje se miden con idéntico criterio. El cálculo es puro y no
 * toca la base de datos, para poder probarlo sin manuscrito real.
 */

export interface WorldCoverage {
  worldId: string;
  name: string;
  kind: MentionEntity["kind"];
  /** Menciones totales en el libro, sumando todas las variantes del nombre. */
  total: number;
  sections: MentionHit[];
  timeline: AppearanceTimeline;
  alerts: AppearanceAlert[];
}

export interface WorldCoverageReport {
  covered: WorldCoverage[];
  /** Fichas que no aparecen en ninguna sección con texto. */
  missing: MentionEntity[];
  /** Secciones revisadas, sin contar las vacías. */
  sections: number;
}

export function buildWorldCoverage(
  worlds: readonly MentionEntity[],
  sections: readonly MentionSection[],
): WorldCoverageReport {
  const readable = [...sections]
    .filter((section) => section.text.trim().length > 0)
    .sort((a, b) => a.order - b.order);

  const byId = new Map(worlds.map((world) => [world.id, world]));

  const covered: WorldCoverage[] = detectEntityMentions(worlds, readable)
    .map((proposal) => {
      const world = byId.get(proposal.entityId);
      const timeline = buildAppearanceTimeline(
        readable.map((section) => ({
          id: section.id,
          title: section.title,
          order: section.order,
        })),
        proposal.sections.map((hit) => ({ sectionId: hit.sectionId, count: hit.count })),
      );

      return {
        worldId: proposal.entityId,
        name: proposal.entityName,
        kind: proposal.kind,
        total: proposal.total,
        sections: proposal.sections,
        timeline,
        alerts: world ? detectAppearanceAlerts(world.name, timeline) : [],
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));

  const mentioned = new Set(covered.map((entry) => entry.worldId));

  return {
    covered,
    missing: worlds
      .filter((world) => !mentioned.has(world.id))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    sections: readable.length,
  };
}
