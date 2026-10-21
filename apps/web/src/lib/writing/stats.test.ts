import { describe, expect, it } from "vitest";
import {
  computeGoalProgress,
  computeWordsPerDay,
  dayKey,
  describeGoalProgress,
  summarizePeriod,
  type RevisionSample,
} from "./stats";

function sample(
  sectionId: string,
  version: number,
  wordCount: number,
  createdAt: string,
): RevisionSample {
  return { sectionId, version, wordCount, createdAt: new Date(createdAt) };
}

describe("dayKey", () => {
  it("agrupa por día en la zona horaria del estudio", () => {
    expect(dayKey(new Date("2026-10-20T08:00:00.000Z"))).toBe("2026-10-20");
  });

  it("no cambia de día una revisión nocturna tardía", () => {
    // 23:30 en Madrid (21:30 UTC) sigue siendo el mismo día.
    expect(dayKey(new Date("2026-10-20T21:30:00.000Z"))).toBe("2026-10-20");
  });
});

describe("computeWordsPerDay", () => {
  it("cuenta la diferencia entre revisiones de una misma sección", () => {
    const days = computeWordsPerDay([
      sample("s1", 2, 300, "2026-10-20T10:00:00.000Z"),
      sample("s1", 3, 500, "2026-10-20T12:00:00.000Z"),
    ]);

    expect(days).toEqual([{ date: "2026-10-20", words: 500 }]);
  });

  it("no cuenta palabras cuando una revisión las reduce", () => {
    const days = computeWordsPerDay([
      sample("s1", 2, 400, "2026-10-20T10:00:00.000Z"),
      sample("s1", 3, 200, "2026-10-21T10:00:00.000Z"),
    ]);

    expect(days).toEqual([{ date: "2026-10-20", words: 400 }]);
  });

  it("suma las secciones independientes del mismo día", () => {
    const days = computeWordsPerDay([
      sample("s1", 2, 100, "2026-10-20T10:00:00.000Z"),
      sample("s2", 2, 250, "2026-10-20T15:00:00.000Z"),
    ]);

    expect(days).toEqual([{ date: "2026-10-20", words: 350 }]);
  });

  it("cuenta solo la diferencia cuando la sección ya tenía texto antes del periodo", () => {
    // La revisión anterior al periodo se carga como referencia: sin ella, las
    // 900 palabras de la sección se contarían como escritas dentro del
    // periodo.
    const days = computeWordsPerDay([
      sample("s1", 2, 900, "2026-10-01T10:00:00.000Z"),
      sample("s1", 3, 950, "2026-10-20T10:00:00.000Z"),
    ]);

    expect(days).toEqual([
      { date: "2026-10-01", words: 900 },
      { date: "2026-10-20", words: 50 },
    ]);
  });

  it("devuelve días ordenados", () => {
    const days = computeWordsPerDay([
      sample("s1", 2, 100, "2026-10-22T10:00:00.000Z"),
      sample("s1", 3, 300, "2026-10-20T10:00:00.000Z"),
    ]);

    expect(days.map((day) => day.date)).toEqual(["2026-10-20", "2026-10-22"]);
  });

  it("devuelve una lista vacía sin revisiones", () => {
    expect(computeWordsPerDay([])).toEqual([]);
  });

  it("ignora la primera revisión si no tiene palabras", () => {
    const days = computeWordsPerDay([sample("s1", 2, 0, "2026-10-20T10:00:00.000Z")]);

    expect(days).toEqual([]);
  });
});

describe("summarizePeriod", () => {
  it("resume el total, los días activos y la media", () => {
    const summary = summarizePeriod([
      { date: "2026-10-20", words: 300 },
      { date: "2026-10-21", words: 100 },
      { date: "2026-10-22", words: 0 },
    ]);

    expect(summary.total).toBe(400);
    expect(summary.activeDays).toBe(2);
    expect(summary.averagePerDay).toBe(200);
  });

  it("no divide por cero sin días activos", () => {
    const summary = summarizePeriod([]);

    expect(summary.total).toBe(0);
    expect(summary.averagePerDay).toBe(0);
  });
});

describe("computeGoalProgress", () => {
  it("calcula el porcentaje sobre el objetivo", () => {
    expect(computeGoalProgress(500, 1_000)).toBe(50);
  });

  it("nunca supera el 100 %", () => {
    expect(computeGoalProgress(2_000, 1_000)).toBe(100);
  });

  it("devuelve cero sin objetivo válido", () => {
    expect(computeGoalProgress(500, 0)).toBe(0);
  });
});

describe("describeGoalProgress", () => {
  it("indica las palabras que faltan", () => {
    expect(describeGoalProgress(300, 1_000)).toContain("Faltan 700");
  });

  it("indica cuando el objetivo está superado", () => {
    expect(describeGoalProgress(1_200, 1_000)).toContain("Objetivo superado");
  });
});
