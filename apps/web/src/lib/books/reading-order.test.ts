import { describe, expect, it } from "vitest";
import { editorialOrder } from "./reading-order";

describe("canonical reading order", () => {
  const rows = [
    { id: "part2", title: "II", parentId: null, sortOrder: 1 },
    { id: "chapter2", title: "B", parentId: "part2", sortOrder: 0 },
    { id: "chapter1", title: "A", parentId: "part1", sortOrder: 0 },
    { id: "part1", title: "I", parentId: null, sortOrder: 0 },
    { id: "sub", title: "Sub", parentId: "chapter1", sortOrder: 0 },
  ];
  it("keeps descendants together across parts and nested subchapters", () => {
    expect(editorialOrder(rows).map((x) => x.id)).toEqual([
      "part1",
      "chapter1",
      "sub",
      "part2",
      "chapter2",
    ]);
  });
  it("breaks ties deterministically regardless of query order", () => {
    const tied = ["b", "a"].map((id) => ({ id, title: "Same", sortOrder: 0 }));
    expect(editorialOrder(tied).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("rejects missing or deleted parents for publication, recovers them for navigation", () => {
    const orphan = [{ id: "a", title: "A", parentId: "deleted" }];
    expect(() => editorialOrder(orphan)).toThrow(/estructura/);
    expect(editorialOrder(orphan, false)).toEqual(orphan);
  });
  it("rejects cycles and recovers every section exactly once", () => {
    const cyclic = [
      { id: "a", title: "A", parentId: "b" },
      { id: "b", title: "B", parentId: "a" },
    ];
    expect(() => editorialOrder(cyclic)).toThrow(/estructura/);
    expect(editorialOrder(cyclic, false)).toHaveLength(2);
  });
  it("rejects duplicate identities", () => {
    expect(() => editorialOrder([rows[0]!, rows[0]!])).toThrow(/duplicadas/);
  });
});
