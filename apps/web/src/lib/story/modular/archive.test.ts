import { expect, it } from "vitest";
import { archiveMetadata, planSubtree } from "./archive";
it("selecciona una rama completa sin incluir otras partes ni hermanos", () => {
  const rows = [
    { id: "p", parentId: null },
    { id: "c", parentId: "p" },
    { id: "s", parentId: "c" },
    { id: "other", parentId: null },
    { id: "x", parentId: "other" },
  ];
  expect(planSubtree(rows, "p").map((n) => n.id)).toEqual(["p", "c", "s"]);
  expect(planSubtree(rows, "c").map((n) => n.id)).toEqual(["c", "s"]);
  expect(rows).toHaveLength(5);
});
it("rechaza raíces ajenas, ciclos y lotes desmedidos", () => {
  expect(() => planSubtree([], "foreign")).toThrow();
  expect(() =>
    planSubtree(
      [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ],
      "a",
    ),
  ).toThrow();
  expect(() =>
    planSubtree(
      Array.from({ length: 1001 }, (_, i) => ({ id: String(i), parentId: null })),
      "0",
    ),
  ).toThrow();
});
it("recupera referencias del lote archivado y tolera borrados antiguos", () => {
  expect(archiveMetadata({})).toBeNull();
  expect(archiveMetadata({ archive: { batchId: "ajeno", sectionId: null } })).toBeNull();
  const archive = {
    batchId: "11111111-1111-4111-8111-111111111111",
    sectionId: "22222222-2222-4222-8222-222222222222",
  };
  expect(archiveMetadata({ version: 1, labels: ["Tema"], archive })).toEqual(archive);
});
