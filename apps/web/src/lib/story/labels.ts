/**
 * Etiquetas y opciones de las herramientas de historia.
 *
 * Este módulo lo comparten el servidor y los formularios del navegador: no
 * importa Prisma ni nada marcado como `server-only`. Los valores coinciden
 * con los enums de PostgreSQL.
 */

export const PLAN_KIND_VALUES = ["ACT", "CHAPTER", "SCENE", "SEQUENCE", "OTHER"] as const;
export type PlanKind = (typeof PLAN_KIND_VALUES)[number];

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  ACT: "Acto",
  CHAPTER: "Capítulo",
  SCENE: "Escena",
  SEQUENCE: "Secuencia",
  OTHER: "Otro",
};

export const PLAN_STATUS_VALUES = ["IDEA", "PLANNED", "WRITING", "DONE"] as const;
export type PlanStatus = (typeof PLAN_STATUS_VALUES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  IDEA: "Idea",
  PLANNED: "Planificado",
  WRITING: "En escritura",
  DONE: "Terminado",
};

export const PLAN_STATUS_DESCRIPTIONS: Record<PlanStatus, string> = {
  IDEA: "Chispas y posibilidades sin decidir.",
  PLANNED: "Ya forma parte del mapa de la historia.",
  WRITING: "La escena está tomando forma en el manuscrito.",
  DONE: "Escrita o descartada con intención.",
};

export const CHARACTER_ROLE_VALUES = [
  "PROTAGONIST",
  "ANTAGONIST",
  "SECONDARY",
  "MENTOR",
  "LOVE_INTEREST",
  "OTHER",
] as const;
export type CharacterRoleValue = (typeof CHARACTER_ROLE_VALUES)[number];

export const CHARACTER_ROLE_LABELS: Record<CharacterRoleValue, string> = {
  PROTAGONIST: "Protagonista",
  ANTAGONIST: "Antagonista",
  SECONDARY: "Secundario",
  MENTOR: "Mentor",
  LOVE_INTEREST: "Interés romántico",
  OTHER: "Otro",
};

export const WORLD_KIND_VALUES = [
  "PLACE",
  "CULTURE",
  "ORGANIZATION",
  "SYSTEM",
  "OBJECT",
  "EVENT",
  "OTHER",
] as const;
export type WorldKindValue = (typeof WORLD_KIND_VALUES)[number];

export const WORLD_KIND_LABELS: Record<WorldKindValue, string> = {
  PLACE: "Lugar",
  CULTURE: "Cultura",
  ORGANIZATION: "Organización",
  SYSTEM: "Sistema",
  OBJECT: "Objeto",
  EVENT: "Acontecimiento",
  OTHER: "Otro",
};

export const STORY_GENERAL_LABEL = "Todo el estudio";

export function optionsFromLabels<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): Array<{ value: T; label: string }> {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const PLAN_KIND_OPTIONS = optionsFromLabels(PLAN_KIND_VALUES, PLAN_KIND_LABELS);
export const PLAN_STATUS_OPTIONS = optionsFromLabels(PLAN_STATUS_VALUES, PLAN_STATUS_LABELS);
export const CHARACTER_ROLE_OPTIONS = optionsFromLabels(
  CHARACTER_ROLE_VALUES,
  CHARACTER_ROLE_LABELS,
);
export const WORLD_KIND_OPTIONS = optionsFromLabels(WORLD_KIND_VALUES, WORLD_KIND_LABELS);
