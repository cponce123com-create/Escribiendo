import { expect, it } from "vitest";
import { movePlan, planOrder, validParent, planDiagnostics, type PlanNode } from "./structure";
const node = (
  id: string,
  kind: PlanNode["kind"],
  parentId: string | null = null,
  sortOrder = 0,
): PlanNode => ({
  id,
  kind,
  parentId,
  sortOrder,
  title: id,
  status: "IDEA",
  createdAt: "2026-01-01",
});
const nodes = () => [
  node("p1", "ACT"),
  node("c1", "CHAPTER", "p1"),
  node("s1", "SCENE", "c1"),
  node("c2", "CHAPTER", "p1", 1),
  node("p2", "ACT", null, 1),
];
it("recorre partes, capítulos y escenas con orden estable y sin mutar la entrada", () => {
  const data = nodes().reverse(),
    copy = structuredClone(data);
  expect(planOrder(data).map((n) => n.id)).toEqual(["p1", "c1", "s1", "c2", "p2"]);
  expect(data).toEqual(copy);
});
it("mueve un capítulo con sus escenas a otra parte y conserva el resto", () => {
  const data = nodes();
  const changes = movePlan(data, "c1", "p2", null);
  const result = planOrder(data.map((n) => ({ ...n, ...changes.find((c) => c.id === n.id) })));
  expect(result.map((n) => n.id)).toEqual(["p1", "c2", "p2", "c1", "s1"]);
  expect(result.find((n) => n.id === "s1")?.parentId).toBe("c1");
  expect(data.find((n) => n.id === "c1")?.parentId).toBe("p1");
});
it("permite reordenar antes de un hermano y dejar una escena sin ubicar", () => {
  const data = nodes();
  expect(movePlan(data, "c2", "p1", "c1")).toEqual(
    expect.arrayContaining([
      { id: "c2", parentId: "p1", sortOrder: 0 },
      { id: "c1", parentId: "p1", sortOrder: 1 },
    ]),
  );
  expect(movePlan(data, "s1", null, null)).toContainEqual({
    id: "s1",
    parentId: null,
    sortOrder: 2,
  });
});
it.each([
  ["p1", "c1", null],
  ["s1", "p1", null],
  ["c1", "p2", "c2"],
  ["c1", "p1", "c1"],
  ["ajeno", "p1", null],
])("rechaza un destino inválido: %s %s %s", (id, parent, before) => {
  expect(() => movePlan(nodes(), id!, parent, before)).toThrow();
});
it("rechaza contenedores ajenos, duplicados y ciclos", () => {
  expect(() => planOrder([node("a", "SCENE", "ajeno")])).toThrow();
  expect(() => planOrder([node("a", "ACT"), node("a", "ACT")])).toThrow();
  expect(() => planOrder([node("a", "ACT", "a")])).toThrow();
});
it("mantiene las tarjetas antiguas de tipo libre sin inventar una jerarquía", () => {
  expect(planOrder([node("a", "OTHER"), node("b", "SEQUENCE")])).toHaveLength(2);
  expect(validParent("ACT", "ACT")).toBe(false);
  expect(validParent("CHAPTER", "ACT")).toBe(true);
});
it("diagnostica huecos reales y títulos repetidos sin completar contenido", () => {
  const cards = [
    node("a", "CHAPTER"),
    { ...node("b", "CHAPTER"), title: "a" },
    node("s", "SCENE"),
  ].map((n) => ({ ...n, summary: null, goal: null, outcome: null }));
  const notes = planDiagnostics(cards);
  expect(notes.join(" ")).toContain("2 capítulos necesitan");
  expect(notes.join(" ")).toContain("escena sin capítulo");
  expect(notes.join(" ")).toContain("títulos de capítulo repetidos");
});
it("ordena un libro de 30 capítulos y 150 escenas de forma reproducible", () => {
  const data = [
    node("parte", "ACT"),
    ...Array.from({ length: 30 }, (_, i) => [
      node(`c${i}`, "CHAPTER", "parte", i),
      ...Array.from({ length: 5 }, (_, j) => node(`s${i}-${j}`, "SCENE", `c${i}`, j)),
    ]).flat(),
  ];
  expect(
    planOrder(data)
      .filter((n) => n.kind === "CHAPTER")
      .map((n) => n.id),
  ).toEqual(Array.from({ length: 30 }, (_, i) => `c${i}`));
  expect(planOrder(data)).toHaveLength(181);
});
