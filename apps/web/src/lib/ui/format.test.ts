import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatPercent } from "./format";

describe("formatPercent", () => {
  it("usa la coma decimal española y dos decimales", () => {
    expect(formatPercent(83.333)).toBe("83,33%");
    expect(formatPercent(50)).toBe("50,00%");
    expect(formatPercent(100)).toBe("100,00%");
  });
});

describe("formatDateTime en Perú", () => {
  it("muestra la fecha y hora local al cruzar la medianoche UTC", () => {
    const instant = new Date("2026-10-24T04:30:00.000Z");
    expect(formatDateTime(instant)).toContain("23 oct 2026");
    expect(formatDateTime(instant)).toContain("23:30");
    expect(formatDate(instant)).toContain("23 de octubre de 2026");
  });
});
