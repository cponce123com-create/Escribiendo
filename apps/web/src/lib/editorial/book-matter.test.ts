import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { composeMatter, sectionsForMatter, type BookMatter } from "./book-matter";
const matter: BookMatter = {
  tocSources: [{ id: "chapter", title: "Capítulo", level: 1, group: "body", showInToc: true }],
  tocOptions: { depth: "chapters-h1" },
  legal: null,
  legalMode: "print",
  hasTocSection: true,
  hasCopyrightSection: false,
};
it("un índice antiguo no apaga el automático sin modo MANUAL explícito", () => {
  expect(
    composeMatter(matter, new Map([["chapter", 12]])).front[0]?.blocks.some((block) =>
      block.text.includes("12"),
    ),
  ).toBe(true);
  expect(composeMatter({ ...matter, tocMode: "MANUAL" }, new Map()).front).toEqual([]);
});
it("cambiar modos legales excluye de la salida sin modificar secciones", () => {
  const sections = [
    { id: "legal", type: "COPYRIGHT" },
    { id: "chapter", type: "CHAPTER" },
  ];
  expect(sectionsForMatter(sections, { ...matter, legalPageMode: "DISABLED" })).toEqual([
    sections[1],
  ]);
  expect(sections).toHaveLength(2);
});
