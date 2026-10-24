/**
 * Estadísticas de escritura derivadas del historial de revisiones.
 *
 * No hay tabla de actividad: las palabras escritas en un periodo se
 * calculan a partir de las revisiones, comparando el recuento de cada
 * revisión con el de la anterior de la misma sección. Así las estadísticas
 * nunca pueden divergir del contenido real.
 */

export interface RevisionSample {
  sectionId: string;
  version: number;
  wordCount: number;
  createdAt: Date;
}

export interface DailyStat {
  /** Clave de día en formato `AAAA-MM-DD`. */
  date: string;
  words: number;
}

export interface PeriodStat {
  total: number;
  averagePerDay: number;
  activeDays: number;
  days: DailyStat[];
}

/** Zona horaria en la que el estudio agrupa sus días. */
const TIME_ZONE = "America/Lima";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

/** Clave ISO de día en la zona horaria del estudio, independiente del locale ICU. */
export function dayKey(date: Date): string {
  const parts = DAY_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new RangeError("No se pudo determinar la fecha local del estudio.");
  }

  return `${year}-${month}-${day}`;
}

/**
 * Calcula las palabras escritas por día.
 *
 * Solo se cuentan las palabras añadidas: cuando una revisión reduce el
 * recuento, la diferencia es negativa y no se compensa con días anteriores.
 * Editar no es escribir.
 */
export function computeWordsPerDay(samples: RevisionSample[]): DailyStat[] {
  const bySection = new Map<string, RevisionSample[]>();

  for (const sample of samples) {
    const list = bySection.get(sample.sectionId) ?? [];
    list.push(sample);
    bySection.set(sample.sectionId, list);
  }

  const totals = new Map<string, number>();

  for (const list of bySection.values()) {
    const ordered = [...list].sort((left, right) => left.version - right.version);
    let previous = 0;

    for (const sample of ordered) {
      const delta = sample.wordCount - previous;
      previous = sample.wordCount;

      if (delta <= 0) {
        continue;
      }

      const key = dayKey(sample.createdAt);
      totals.set(key, (totals.get(key) ?? 0) + delta);
    }
  }

  return [...totals.entries()]
    .map(([date, words]) => ({ date, words }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/** Resume un periodo de escritura. */
export function summarizePeriod(days: DailyStat[]): PeriodStat {
  const total = days.reduce((sum, day) => sum + day.words, 0);
  const activeDays = days.filter((day) => day.words > 0).length;

  return {
    total,
    activeDays,
    averagePerDay: activeDays > 0 ? Math.round((total / activeDays) * 100) / 100 : 0,
    days,
  };
}

/**
 * Progreso de un objetivo de palabras.
 *
 * El progreso se limita al 100 %: un objetivo superado no da más de lo
 * mismo, y un objetivo caducado no resta progreso.
 */
export function computeGoalProgress(wordsWritten: number, targetWords: number): number {
  if (targetWords <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((wordsWritten / targetWords) * 10000) / 100);
}

/** Texto legible del estado de un objetivo. */
export function describeGoalProgress(wordsWritten: number, targetWords: number): string {
  if (targetWords <= 0) {
    return "Sin objetivo";
  }

  const progress = computeGoalProgress(wordsWritten, targetWords);
  const remaining = Math.max(0, targetWords - wordsWritten);

  if (remaining === 0) {
    return `Objetivo superado (${progress} %).`;
  }

  return `${wordsWritten} de ${targetWords} palabras (${progress} %). Faltan ${remaining}.`;
}
