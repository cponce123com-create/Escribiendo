import { expect, it } from "vitest";
import {
  chronologyWarnings,
  formatNarrativePeriod,
  narrativeStructure,
  NARRATIVE_STRUCTURES,
  validateNarrativePeriod,
  validNarrativeDate,
} from "./narrative-planning";
it("valida calendario, años bisiestos y fechas históricas sin Date ni zona horaria", () => {
  expect(validNarrativeDate("2000-02-29")).toBe(true);
  expect(validNarrativeDate("1900-02-29")).toBe(false);
  expect(validNarrativeDate("0001-01-01")).toBe(true);
  expect(validNarrativeDate("0000-01-01")).toBe(false);
  expect(validNarrativeDate("2026-04-31")).toBe(false);
  expect(validateNarrativePeriod("2020-01-01", "2019-12-31", "EXACT")).toContain("anterior");
  expect(validateNarrativePeriod("2020-01-01", "", "YEAR")).toBeNull();
  expect(formatNarrativePeriod({ startsOn: "2020-01-01", datePrecision: "YEAR" })).toBe("2020");
});
it("separa orden narrativo de cronológico y se abstiene ante aproximaciones", () => {
  const events = [
    { id: "a", title: "Después", startsOn: "2020-01-01", datePrecision: "EXACT", sequence: 0 },
    { id: "b", title: "Antes", startsOn: "1990-01-01", datePrecision: "EXACT", sequence: 1 },
  ];
  expect(chronologyWarnings(events)).toHaveLength(1);
  expect(chronologyWarnings(events.map((e) => ({ ...e, datePrecision: "APPROXIMATE" })))).toEqual(
    [],
  );
});
it("ofrece doce etapas opcionales y rechaza nombres de prototipo", () => {
  expect(NARRATIVE_STRUCTURES.HERO_JOURNEY).toHaveLength(12);
  expect(narrativeStructure("__proto__")).toBe("FREE");
});
