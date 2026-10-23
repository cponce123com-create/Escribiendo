import { dayKey, type DailyStat } from "@/lib/writing/stats";

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
