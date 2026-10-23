import { expect, it } from "vitest";
import { legalClausesSchema } from "./legal-clauses";
it("valida límites y controles antes de separar cláusulas", () => {
  expect(legalClausesSchema.parse(" Una línea\n\nOtra ")).toEqual(["Una línea", "Otra"]);
  expect(legalClausesSchema.safeParse("a".repeat(4001)).success).toBe(false);
  expect(legalClausesSchema.safeParse("texto\u0007").success).toBe(false);
});
