import { describe, expect, it } from "vitest";
import { inlineRuns, marksOf } from "./inline";

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

describe("inlineRuns con referencias cruzadas", () => {
  const referencia = {
    type: "crossReference",
    attrs: { targetId: "s2", label: "Capítulo 2", format: "page" },
  };

  it("resuelve el folio con el mapa de páginas", () => {
    const runs = inlineRuns(referencia, undefined, {
      crossReferences: {
        pageMap: new Map([["s2", 42]]),
        titles: new Map([["s2", "Capítulo 2"]]),
      },
    });

    expect(runs).toEqual([{ text: "42" }]);
  });

  it("cae al título cuando no hay mapa de páginas", () => {
    expect(inlineRuns(referencia)).toEqual([{ text: "Capítulo 2" }]);
  });

  it("respeta el formato de título", () => {
    const runs = inlineRuns(
      { ...referencia, attrs: { ...referencia.attrs, format: "title" } },
      undefined,
      {
        crossReferences: {
          pageMap: new Map(),
          titles: new Map([["s2", "Capítulo 2"]]),
        },
      },
    );

    expect(runs).toEqual([{ text: "Capítulo 2" }]);
  });
});
