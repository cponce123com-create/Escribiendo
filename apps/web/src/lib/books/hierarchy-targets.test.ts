import { expect, it } from "vitest";
import { buildSectionTree } from "./section-tree";
import { hierarchyTargets } from "./hierarchy-targets";

it("sangra al final de la hermana anterior y saca detrás del padre", () => {
  const roots = buildSectionTree([
    {
      id: "a",
      parentId: null,
      sortOrder: 0,
      title: "A",
      type: "CHAPTER",
      wordCount: 0,
      version: 1,
    },
    {
      id: "b",
      parentId: null,
      sortOrder: 1,
      title: "B",
      type: "CHAPTER",
      wordCount: 0,
      version: 1,
    },
    {
      id: "c",
      parentId: "a",
      sortOrder: 0,
      title: "C",
      type: "SUBCHAPTER",
      wordCount: 0,
      version: 1,
    },
  ]);
  expect(hierarchyTargets(roots[0]!, roots)).toEqual({ indent: null, outdent: null });
  expect(hierarchyTargets(roots[1]!, roots).indent).toEqual({ parentId: "a", position: 1 });
  expect(hierarchyTargets(roots[0]!.children[0]!, roots).outdent).toEqual({
    parentId: null,
    position: 1,
  });
});
