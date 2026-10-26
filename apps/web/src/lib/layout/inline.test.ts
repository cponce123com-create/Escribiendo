import { describe, expect, it } from "vitest";
import { marksOf } from "./inline";

describe("marksOf con glosario", () => {
  it("lee el término de la marca", () => {
    expect(marksOf([{ type: "glossaryTerm", attrs: { term: "Zeugma" } }])).toEqual({
      glossary: "Zeugma",
    });
  });

  it("ignora un término vacío", () => {
    expect(marksOf([{ type: "glossaryTerm", attrs: { term: "" } }])).toBeUndefined();
  });

  it("combina glosario y negrita", () => {
    expect(marksOf([{ type: "bold" }, { type: "glossaryTerm", attrs: { term: "Ana" } }])).toEqual({
      bold: true,
      glossary: "Ana",
    });
  });
});
