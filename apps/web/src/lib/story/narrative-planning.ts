import { validCalendarDate } from "@escribiendo/book-schema";
export const NARRATIVE_STRUCTURES = {
  FREE: ["Estructura libre"],
  THREE_ACTS: ["Acto I · Planteamiento", "Acto II · Confrontación", "Acto III · Resolución"],
  FIVE_ACTS: ["Exposición", "Acción ascendente", "Clímax", "Acción descendente", "Desenlace"],
  HERO_JOURNEY: [
    "Mundo ordinario",
    "Llamada a la aventura",
    "Rechazo de la llamada",
    "Encuentro con el mentor",
    "Cruce del umbral",
    "Pruebas y aliados",
    "Acercamiento",
    "Ordalía",
    "Recompensa",
    "Camino de regreso",
    "Resurrección",
    "Regreso con el elixir",
  ],
} as const;
export type NarrativeStructure = keyof typeof NARRATIVE_STRUCTURES;
export function narrativeStructure(value: unknown): NarrativeStructure {
  return value === "THREE_ACTS" || value === "FIVE_ACTS" || value === "HERO_JOURNEY"
    ? value
    : "FREE";
}
export const DATE_PRECISIONS = ["UNDATED", "EXACT", "APPROXIMATE", "YEAR"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
export const validNarrativeDate = validCalendarDate;
export function validateNarrativePeriod(
  start: string,
  end: string,
  precision: string,
): string | null {
  if (!(DATE_PRECISIONS as readonly string[]).includes(precision))
    return "Elige una precisión temporal válida.";
  if (precision === "UNDATED")
    return start || end ? "Selecciona una precisión para guardar fechas." : null;
  if (!validNarrativeDate(start) || (end && !validNarrativeDate(end)))
    return "Introduce fechas válidas; comprueba el día, mes y año.";
  if (end && end < start) return "El final del intervalo no puede ser anterior al inicio.";
  if (precision === "YEAR" && (!start.endsWith("-01-01") || (end && !end.endsWith("-01-01"))))
    return "Para años sin día conocido utiliza el 1 de enero y precisión Solo año; se mostrará únicamente el año.";
  return null;
}
export function formatNarrativePeriod(event: {
  startsOn?: string | null;
  endsOn?: string | null;
  datePrecision?: string;
}): string {
  if (!event.startsOn || event.datePrecision === "UNDATED") return "Sin fecha";
  const display = (date: string) =>
    event.datePrecision === "YEAR" ? date.slice(0, 4) : date.split("-").reverse().join("/");
  return `${event.datePrecision === "APPROXIMATE" ? "Aprox. " : ""}${display(event.startsOn)}${event.endsOn ? ` – ${display(event.endsOn)}` : ""}`;
}
export function chronologyWarnings(
  events: readonly {
    id: string;
    title: string;
    startsOn?: string | null;
    endsOn?: string | null;
    datePrecision?: string;
    sequence?: number;
    chronologicalOrder?: number;
  }[],
) {
  const warnings: { id: string; message: string }[] = [];
  let previous: (typeof events)[number] | undefined;
  for (const event of [...events].sort(
    (a, b) => (a.sequence ?? a.chronologicalOrder ?? 0) - (b.sequence ?? b.chronologicalOrder ?? 0),
  )) {
    if (!event.startsOn || event.datePrecision === "UNDATED") continue;
    const error = validateNarrativePeriod(
      event.startsOn,
      event.endsOn ?? "",
      event.datePrecision ?? "EXACT",
    );
    if (error) warnings.push({ id: event.id, message: `${event.title}: ${error}` });
    // Solo fechas exactas y períodos no solapados prueban un desacuerdo con el orden manual.
    if (
      previous?.startsOn &&
      previous.datePrecision === "EXACT" &&
      event.datePrecision === "EXACT" &&
      (event.endsOn ?? event.startsOn) < previous.startsOn
    )
      warnings.push({
        id: event.id,
        message: `Revisa el orden cronológico: «${event.title}» está fechado antes que «${previous.title}». El orden narrativo puede ser distinto.`,
      });
    previous = event;
  }
  return warnings;
}
