import { describe, expect, it } from "vitest";
import {
  buildSectionTree,
  countChapterLike,
  flattenSectionTree,
  sumWords,
  type SectionRow,
} from "./section-tree";

function row(partial: Partial<SectionRow> & { id: string }): SectionRow {
  return {
    parentId: null,
    type: "CHAPTER",
    title: `Sección ${partial.id}`,
    sortOrder: 0,
    wordCount: 0,
    version: 1,
    ...partial,
  };
}

describe("buildSectionTree", () => {
  it("devuelve las raíces cuando no hay jerarquía", () => {
    const tree = buildSectionTree([row({ id: "a", title: "A" }), row({ id: "b", title: "B" })]);

    expect(tree).toHaveLength(2);
    expect(tree.every((node) => node.children.length === 0)).toBe(true);
  });

  it("anida las secciones bajo su padre", () => {
    const tree = buildSectionTree([
      row({ id: "a", title: "Parte" }),
      row({ id: "b", parentId: "a", title: "Capítulo" }),
      row({ id: "c", parentId: "b", title: "Escena" }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe("b");
    expect(tree[0]?.children[0]?.children[0]?.id).toBe("c");
  });

  it("ordena por sortOrder y, a igualdad, por título", () => {
    const tree = buildSectionTree([
      row({ id: "a", title: "Zeta", sortOrder: 1 }),
      row({ id: "b", title: "Alfa", sortOrder: 1 }),
      row({ id: "c", title: "Beta", sortOrder: 0 }),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["c", "b", "a"]);
  });

  it("trata como raíz una sección cuyo padre ya no existe", () => {
    const tree = buildSectionTree([row({ id: "huerfana", parentId: "inexistente" })]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe("huerfana");
  });

  it("termina ante un ciclo de padres", () => {
    const tree = buildSectionTree([
      row({ id: "a", parentId: "b" }),
      row({ id: "b", parentId: "a" }),
    ]);

    expect(flattenSectionTree(tree).length).toBe(2);
  });

  it("no duplica nodos", () => {
    const tree = buildSectionTree([
      row({ id: "a" }),
      row({ id: "b", parentId: "a" }),
      row({ id: "c", parentId: "a" }),
    ]);

    expect(flattenSectionTree(tree).map((node) => node.id)).toEqual(["a", "b", "c"]);
  });
});

describe("flattenSectionTree", () => {
  it("devuelve las secciones en orden de lectura", () => {
    const tree = buildSectionTree([
      row({ id: "a", sortOrder: 0 }),
      row({ id: "b", parentId: "a", sortOrder: 0 }),
      row({ id: "c", sortOrder: 1 }),
    ]);

    expect(flattenSectionTree(tree).map((node) => node.id)).toEqual(["a", "b", "c"]);
  });
});

describe("countChapterLike", () => {
  it("cuenta solo los tipos indicados", () => {
    const tree = buildSectionTree([
      row({ id: "a", type: "PART" }),
      row({ id: "b", type: "CHAPTER", parentId: "a" }),
      row({ id: "c", type: "EPILOGUE", parentId: "a" }),
      row({ id: "d", type: "COPYRIGHT" }),
    ]);

    expect(countChapterLike(tree, (type) => type === "CHAPTER")).toBe(1);
  });
});

describe("sumWords", () => {
  it("suma las palabras de todo el árbol", () => {
    const tree = buildSectionTree([
      row({ id: "a", wordCount: 100 }),
      row({ id: "b", parentId: "a", wordCount: 250 }),
      row({ id: "c", wordCount: 50 }),
    ]);

    expect(sumWords(tree)).toBe(400);
  });
});
