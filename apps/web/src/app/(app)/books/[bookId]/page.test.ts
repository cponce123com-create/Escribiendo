import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  book: {
    id: "book",
    title: "El príncipe mestizo",
    subtitle: "Un viaje por la Selva Central",
    penName: "El príncipe mestizo",
    authorName: "Editorial No Para Todos",
    genre: "Novela",
    language: "es",
    description: "Un manuscrito en construcción.",
    cover: null,
    wordCount: 9000,
    chapterCount: 8,
    targetWordCount: 50000,
    writingProgress: 18,
    status: "DRAFT",
    updatedAt: new Date("2026-10-23T12:00:00Z"),
    createdBy: { name: "Autor" },
  },
  tree: [
    {
      id: "prologue",
      title: "Prólogo",
      type: "PROLOGUE",
      parentId: null,
      sortOrder: 0,
      wordCount: 100,
      version: 1,
      children: [],
    },
    {
      id: "chapter",
      title: "El comienzo",
      type: "CHAPTER",
      parentId: null,
      sortOrder: 1,
      wordCount: 200,
      version: 1,
      children: [],
    },
  ],
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn().mockResolvedValue({ workspace: { id: "w", role: "OWNER" } }),
}));
vi.mock("@/lib/books/queries", () => ({
  getBook: vi.fn().mockImplementation(async () => fixture.book),
  getSectionTree: vi.fn().mockImplementation(async () => fixture.tree),
}));
vi.mock("@/lib/books/covers", () => ({ coverObjectPosition: () => "50% 50%" }));
vi.mock("@/components/books/new-section-form", () => ({
  NewSectionForm: () => createElement("p", null, "Formulario de nueva sección"),
}));
vi.mock("@/components/books/section-tree", () => ({
  SectionTree: () => createElement("p", null, "Prólogo · El comienzo"),
}));
vi.mock("@/components/books/book-status-control", () => ({
  BookStatusControl: () =>
    createElement("button", { className: "btn btn-secondary" }, "Cambiar estado"),
}));
import BookPage from "./page";
it("renders one metadata action, a cover placeholder, a writing action and actual chapter totals", async () => {
  const html = renderToStaticMarkup(
    await BookPage({ params: Promise.resolve({ bookId: "book" }) }),
  );
  expect(html.match(/Editar metadatos/g)).toHaveLength(1);
  expect(html).toContain("Agregar portada");
  expect(html).toContain("Continuar escribiendo");
  expect(html).not.toContain(">9,000<");
  expect(html).toMatch(/Capítulos[\s\S]*?>1<\/p>/);
  // Real server component with isolated data fixtures, for local visual inspection.
  if (process.env.BOOK_DETAIL_VISUAL_DIR) {
    mkdirSync(process.env.BOOK_DETAIL_VISUAL_DIR, { recursive: true });
    writeFileSync(`${process.env.BOOK_DETAIL_VISUAL_DIR}/book-detail.html`, html);
  }
});
