import { describe, expect, it } from "vitest";
import { createSpanishStyleRules } from "@escribiendo/book-schema";
import { buildSectionTree } from "./section-tree";
import { disabledStyleRules, selectAnalysisSections, STYLE_RULE_OPTIONS } from "./analysis-options";
const tree = buildSectionTree([
  {
    id: "front",
    parentId: null,
    type: "PROLOGUE",
    title: "Prólogo",
    sortOrder: 8,
    wordCount: 1,
    version: 1,
  },
  {
    id: "one",
    parentId: null,
    type: "CHAPTER",
    title: "Uno",
    sortOrder: 0,
    wordCount: 1,
    version: 1,
  },
  {
    id: "child",
    parentId: "one",
    type: "SUBCHAPTER",
    title: "Subcapítulo",
    sortOrder: 0,
    wordCount: 1,
    version: 1,
  },
  {
    id: "legal",
    parentId: null,
    type: "COPYRIGHT",
    title: "Legal",
    sortOrder: 1,
    wordCount: 1,
    version: 1,
  },
  {
    id: "two",
    parentId: null,
    type: "CHAPTER",
    title: "Dos",
    sortOrder: 2,
    wordCount: 1,
    version: 1,
  },
]);
describe("alcance del análisis", () => {
  it("selecciona primero en orden editorial y excluye páginas no narrativas", () => {
    expect(selectAnalysisSections(tree)?.map((node) => node.id)).toEqual([
      "front",
      "one",
      "child",
      "two",
    ]);
  });
  it("un capítulo incluye solo sus descendientes", () => {
    expect(selectAnalysisSections(tree, "one")?.map((node) => node.id)).toEqual(["one", "child"]);
    expect(selectAnalysisSections(tree, "child")?.map((node) => node.id)).toEqual(["child"]);
  });
  it("no convierte un ID ajeno ni una página legal en análisis de todo el libro", () => {
    expect(selectAnalysisSections(tree, "foreign")).toBeNull();
    expect(selectAnalysisSections(tree, "legal")).toBeNull();
  });
  it("la configuración solo omite reglas existentes y únicas", () => {
    const [id] = STYLE_RULE_OPTIONS[0];
    expect(disabledStyleRules([id, "__proto__", id])).toEqual([id]);
    expect(STYLE_RULE_OPTIONS.map(([rule]) => rule).sort()).toEqual(
      createSpanishStyleRules()
        .map((rule) => rule.id)
        .sort(),
    );
  });
});
