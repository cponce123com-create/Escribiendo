import { describe, expect, it } from "vitest";
import { dashboardWeek, dashboardWritingActivity, dashboardYearProgress } from "./dashboard";

describe("semana del panel", () => {
  it("incluye siete días ordenados y completa los días sin escritura", () => {
    const week = dashboardWeek(
      [{ date: "2026-10-22", words: 234 }],
      new Date("2026-10-23T10:00:00Z"),
    );
    expect(week).toHaveLength(7);
    expect(week[0]?.date).toBe("2026-10-17");
    expect(week[5]?.words).toBe(234);
    expect(week[6]).toEqual({ date: "2026-10-23", words: 0, label: "vie" });
  });
  it("usa la fecha de Perú, incluso cerca de medianoche y del cambio de año", () => {
    const week = dashboardWeek([], new Date("2026-12-31T23:30:00Z"));
    expect(week[6]?.date).toBe("2026-12-31");
    expect(week[0]?.date).toBe("2026-12-25");
  });
  it("no cuenta datos fuera del periodo ni crea actividad ficticia", () => {
    const week = dashboardWeek(
      [{ date: "2026-10-01", words: 900 }],
      new Date("2026-10-23T12:00:00Z"),
    );
    expect(week.every((day) => day.words === 0)).toBe(true);
  });
});

describe("progreso del año", () => {
  it("muestra el día actual, porcentaje y días restantes en un año común", () => {
    expect(dashboardYearProgress(new Date("2026-10-23T12:00:00Z"))).toEqual({
      year: 2026,
      dayNumber: 296,
      daysInYear: 365,
      daysRemaining: 69,
      percent: 81.1,
    });
  });

  it("cuenta correctamente el 29 de febrero de un año bisiesto", () => {
    expect(dashboardYearProgress(new Date("2024-02-29T12:00:00Z"))).toEqual({
      year: 2024,
      dayNumber: 60,
      daysInYear: 366,
      daysRemaining: 306,
      percent: 16.4,
    });
  });

  it("usa la fecha peruana cerca del cambio de año", () => {
    expect(dashboardYearProgress(new Date("2026-12-31T23:30:00Z"))).toEqual({
      year: 2026,
      dayNumber: 365,
      daysInYear: 365,
      daysRemaining: 0,
      percent: 100,
    });
    expect(dashboardYearProgress(new Date("2027-01-01T05:00:00Z"))).toEqual({
      year: 2027,
      dayNumber: 1,
      daysInYear: 365,
      daysRemaining: 364,
      percent: 0.3,
    });
  });
});

describe("actividad de escritura del dashboard", () => {
  it("suma las palabras de hoy y cuenta una racha que incluye el día actual", () => {
    expect(
      dashboardWritingActivity(
        [
          { date: "2026-10-23", words: 120 },
          { date: "2026-10-22", words: 35 },
          { date: "2026-10-21", words: 80 },
          { date: "2026-10-19", words: 12 },
        ],
        new Date("2026-10-23T12:00:00Z"),
      ),
    ).toEqual({ wordsToday: 120, activeStreakDays: 3, wroteToday: true });
  });

  it("mantiene la racha de ayer hasta que cambie el día si hoy aún no se ha escrito", () => {
    expect(
      dashboardWritingActivity(
        [
          { date: "2026-10-22", words: 35 },
          { date: "2026-10-21", words: 80 },
        ],
        new Date("2026-10-23T12:00:00Z"),
      ),
    ).toEqual({ wordsToday: 0, activeStreakDays: 2, wroteToday: false });
  });

  it("reinicia la racha tras un día sin actividad y respeta la zona horaria del estudio", () => {
    expect(
      dashboardWritingActivity(
        [
          { date: "2026-10-24", words: 35 },
          { date: "2026-10-22", words: 80 },
        ],
        new Date("2026-10-25T12:00:00Z"),
      ),
    ).toEqual({ wordsToday: 0, activeStreakDays: 1, wroteToday: false });

    expect(
      dashboardWritingActivity(
        [{ date: "2026-10-23", words: 9 }],
        new Date("2026-10-23T23:30:00Z"),
      ),
    ).toEqual({ wordsToday: 9, activeStreakDays: 1, wroteToday: true });
  });
});
