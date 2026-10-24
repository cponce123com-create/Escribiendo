import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { laboratoryTools } from "@/lib/books/laboratory-navigation";
const mocks = vi.hoisted(() => ({ book: vi.fn(), tree: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ workspace: { id: "workspace" } }),
}));
vi.mock("@/lib/books/queries", () => ({ getBook: mocks.book, getSectionTree: mocks.tree }));
vi.mock("@/lib/db", () => ({ prisma: { storyCharacter: { count: mocks.count } } }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import LaboratoryPage from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.book.mockResolvedValue({ id: "book", title: "El río", wordCount: 120 });
  mocks.tree.mockResolvedValue([{ id: "chapter", type: "CHAPTER", title: "Uno", children: [] }]);
  mocks.count.mockResolvedValue(2);
});
it("conecta las diez categorías sin ejecutar análisis al abrir el laboratorio", async () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      await LaboratoryPage({ params: Promise.resolve({ bookId: "book" }) }),
    ),
  );
  expect(html).toContain("Laboratorio Editorial");
  for (const tool of laboratoryTools("book", "chapter")) expect(html).toContain(tool.name);
  expect(html).toContain("/books/book/sections/chapter");
  expect(html).toContain("/books/book/analysis#analysis-options");
  expect(mocks.count).toHaveBeenCalledWith({
    where: { bookId: "book", workspaceId: "workspace", deletedAt: null },
  });
});
it("rechaza un libro ajeno sin consultar personajes o secciones", async () => {
  mocks.book.mockResolvedValue(null);
  await expect(LaboratoryPage({ params: Promise.resolve({ bookId: "foreign" }) })).rejects.toThrow(
    "NOT_FOUND",
  );
  expect(mocks.count).not.toHaveBeenCalled();
  expect(mocks.tree).not.toHaveBeenCalled();
});
it("un manuscrito vacío no enlaza una sección inexistente", () => {
  expect(laboratoryTools("book")[0]?.href).toBe("/books/book/edit");
});
