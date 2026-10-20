/**
 * Fases del proyecto.
 *
 * La lista es la única fuente de verdad sobre qué hay implementado: el panel
 * lateral muestra las fases que faltan y la documentación puede consultarla.
 * Cuando una fase se termina, se marca aquí y desaparece de «próximas fases».
 */

export type PhaseStatus = "completed" | "pending";

export interface PhaseDefinition {
  id: number;
  label: string;
  /** Identificador breve, para enlaces y referencias. */
  slug: string;
  status: PhaseStatus;
}

export const PHASES: readonly PhaseDefinition[] = [
  { id: 1, label: "Fundaciones y acceso", slug: "fundaciones", status: "completed" },
  { id: 2, label: "Biblioteca y manuscritos", slug: "biblioteca", status: "completed" },
  { id: 3, label: "Escritura asistida", slug: "escritura", status: "completed" },
  { id: 4, label: "Maquetación", slug: "maquetacion", status: "completed" },
  { id: 5, label: "Exportación", slug: "exportacion", status: "completed" },
  { id: 6, label: "Equipo y gobernanza", slug: "equipo", status: "pending" },
  { id: 7, label: "Operación editorial", slug: "operacion", status: "pending" },
];

/** Fases que todavía no están implementadas. */
export const UPCOMING_PHASES: readonly PhaseDefinition[] = PHASES.filter(
  (phase) => phase.status === "pending",
);
