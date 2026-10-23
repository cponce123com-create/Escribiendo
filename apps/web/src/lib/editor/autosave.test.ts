import { expect, it } from "vitest";
import { remainingAutosaveDelay } from "./autosave";
it("espera solo lo que falta para completar el intervalo de autoguardado", () => {
  expect(remainingAutosaveDelay(1000, 11000)).toBe(35000);
  expect(remainingAutosaveDelay(1000, 46000)).toBe(0);
  expect(remainingAutosaveDelay(1000, 90000)).toBe(0);
  expect(remainingAutosaveDelay(1000, 500)).toBe(45000);
});
