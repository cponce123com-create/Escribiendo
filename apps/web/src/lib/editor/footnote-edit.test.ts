import { expect, it } from "vitest";
import { parseFootnoteEdit } from "./footnote-edit";
it("acepta una referencia existente y rechaza posiciones o datos corruptos", () => {
  expect(parseFootnoteEdit({ id: "nota", pos: 0, note: "Texto" })).toEqual({
    id: "nota",
    pos: 0,
    note: "Texto",
  });
  for (const value of [
    null,
    {},
    { id: "n", pos: -1, note: "t" },
    { id: "n", pos: 1.5, note: "t" },
    { id: "", pos: 0, note: "t" },
  ]) {
    expect(parseFootnoteEdit(value)).toBeNull();
  }
});
