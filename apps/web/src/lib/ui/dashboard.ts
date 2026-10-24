import { dayKey, type DailyStat } from "@/lib/writing/stats";

export interface DashboardYearProgress {
  year: number;
  dayNumber: number;
  daysInYear: number;
  daysRemaining: number;
  percent: number;
}

export interface DashboardWritingActivity {
  wordsToday: number;
  activeStreakDays: number;
  wroteToday: boolean;
}

/** Progreso del año calendario en la zona horaria del estudio (Perú). */
export function dashboardYearProgress(now = new Date()): DashboardYearProgress {
  const [year = 0, month = 1, day = 1] = dayKey(now).split("-").map(Number);
  const yearStart = Date.UTC(year, 0, 1);
  const currentDate = Date.UTC(year, month - 1, day);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  const dayNumber = Math.floor((currentDate - yearStart) / 86_400_000) + 1;
  const daysInYear = Math.round((nextYearStart - yearStart) / 86_400_000);
  const percent = Math.min(100, Math.max(0, Math.round((dayNumber / daysInYear) * 1_000) / 10));

  return {
    year,
    dayNumber,
    daysInYear,
    daysRemaining: daysInYear - dayNumber,
    percent,
  };
}

/** Resume las palabras añadidas hoy y los días activos consecutivos. */
export function dashboardWritingActivity(
  days: readonly DailyStat[],
  now = new Date(),
): DashboardWritingActivity {
  const wordsByDay = new Map<string, number>();
  for (const day of days) {
    wordsByDay.set(day.date, (wordsByDay.get(day.date) ?? 0) + day.words);
  }

  const today = dayKey(now);
  const wordsToday = wordsByDay.get(today) ?? 0;
  const wroteToday = wordsToday > 0;
  const activeDays = new Set(
    [...wordsByDay].filter(([, words]) => words > 0).map(([date]) => date),
  );
  const cursor = new Date(`${wroteToday ? today : previousDay(today)}T12:00:00Z`);
  let activeStreakDays = 0;

  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    activeStreakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { wordsToday, activeStreakDays, wroteToday };
}

function previousDay(date: string): string {
  const previous = new Date(`${date}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

/** Siete días del estudio, incluidos los días sin revisiones. */
export function dashboardWeek(days: readonly DailyStat[], now = new Date()) {
  const today = new Date(`${dayKey(now)}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const key = date.toISOString().slice(0, 10);
    const words = days.find((day) => day.date === key)?.words ?? 0;
    return {
      date: key,
      label: new Intl.DateTimeFormat("es", { weekday: "short", timeZone: "UTC" }).format(date),
      words,
    };
  });
}
