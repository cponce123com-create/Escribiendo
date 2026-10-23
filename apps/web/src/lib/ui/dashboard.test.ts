import { describe, expect, it } from "vitest";
import { dashboardWeek } from "./dashboard";

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
  it("usa la fecha de Madrid, incluso cerca de medianoche y del cambio de año", () => {
    const week = dashboardWeek([], new Date("2026-12-31T23:30:00Z"));
    expect(week[6]?.date).toBe("2027-01-01");
    expect(week[0]?.date).toBe("2026-12-26");
  });
  it("no cuenta datos fuera del periodo ni crea actividad ficticia", () => {
    const week = dashboardWeek(
      [{ date: "2026-10-01", words: 900 }],
      new Date("2026-10-23T12:00:00Z"),
    );
    expect(week.every((day) => day.words === 0)).toBe(true);
  });
});
