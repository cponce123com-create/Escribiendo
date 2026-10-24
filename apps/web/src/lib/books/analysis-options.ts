import type { SectionNode } from "./section-tree";
import { flattenSectionTree } from "./section-tree";

export const STYLE_RULE_OPTIONS = [
  ["es.style.repeated-connectors", "Conectores repetidos"],
  ["es.style.frequent-fillers", "Muletillas"],
  ["es.style.mente-adverbs", "Adverbios en -mente"],
  ["es.style.long-sentences", "Oraciones largas"],
  ["es.style.long-paragraphs", "Párrafos extensos"],
  ["es.style.known-redundancies", "Redundancias conocidas"],
  ["es.style.potential-ambiguity", "Posibles ambigüedades"],
  ["es.style.verbose-constructions", "Construcciones extensas"],
  ["es.style.punctuation-patterns", "Puntuación"],
] as const;
export interface BookAnalysisOptions {
  sectionId?: string;
  disabledRules?: readonly string[];
}
export const NARRATIVE_ANALYSIS_TYPES: ReadonlySet<string> = new Set([
  "PART",
  "CHAPTER",
  "SUBCHAPTER",
  "INTERLUDE",
  "EPILOGUE",
  "PROLOGUE",
  "INTRODUCTION",
]);

/** Escoge primero en orden editorial y limita después. Un ID ajeno nunca amplía el análisis. */
export function selectAnalysisSections(
  tree: readonly SectionNode[],
  sectionId?: string,
): SectionNode[] | null {
  const all = flattenSectionTree([...tree]);
  const selected = sectionId ? all.find((node) => node.id === sectionId) : undefined;
  if (sectionId && (!selected || !NARRATIVE_ANALYSIS_TYPES.has(selected.type))) return null;
  const scope = selected ? flattenSectionTree([selected]) : all;
  return scope.filter((node) => NARRATIVE_ANALYSIS_TYPES.has(node.type));
}
export function disabledStyleRules(values: string | string[] | undefined): string[] {
  const allowed = new Set<string>(STYLE_RULE_OPTIONS.map(([id]) => id));
  return [
    ...new Set(
      (typeof values === "string" ? [values] : (values ?? [])).filter((id) => allowed.has(id)),
    ),
  ];
}
