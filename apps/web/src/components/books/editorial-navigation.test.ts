import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  section: {
    id: "old-legal",
    bookId: "book",
    type: "COPYRIGHT",
    title: "Copyright",
    version: 2,
    wordCount: 4,
    updatedAt: new Date("2026-10-23T00:00:00Z"),
    assignee: null,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Contenido anterior conservado" }] },
      ],
    },
  },
  getSection: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({
    workspace: { id: "workspace", role: "OWNER" },
    user: { id: "user" },
  }),
}));
vi.mock("@/lib/books/actions", () => ({
  deleteSectionAction: vi.fn(),
  moveSectionAction: vi.fn(),
}));
vi.mock("@/lib/books/queries", () => ({
  getSection: fixture.getSection,
  getBook: async () => ({ title: "Libro" }),
  listRevisions: async () => [],
  getSectionTree: async () => [],
}));
vi.mock("@/lib/books/assets", () => ({ listBookAssets: async () => [] }));
vi.mock("@/lib/team/members", () => ({ listMembers: async () => [] }));
vi.mock("@/lib/writing/notes", () => ({ listBookNotes: async () => [] }));
vi.mock("@/components/books/new-section-form", () => ({ NewSectionForm: () => null }));
vi.mock("@/components/books/section-editor", () => ({
  SectionEditor: ({ content }: { content: unknown }) =>
    createElement("div", null, JSON.stringify(content)),
}));
vi.mock("@/components/books/manuscript-workspace", () => ({
  ManuscriptWorkspace: ({ editor }: { editor: ReactNode }) => createElement("div", null, editor),
}));
vi.mock("@/components/books/studio-inspector", () => ({ StudioInspector: () => null }));
vi.mock("@/components/books/section-options-form", () => ({ SectionOptionsForm: () => null }));
vi.mock("@/components/books/section-title-form", () => ({ SectionTitleForm: () => null }));
vi.mock("@/components/books/search-fragment-on-load", () => ({ SearchFragmentOnLoad: () => null }));
vi.mock("@/components/team/assign-select", () => ({ AssignSelect: () => null }));
import { ManuscriptSidebar } from "./manuscript-sidebar";
import { SectionTree } from "./section-tree";
import SectionPage from "@/app/(app)/books/[bookId]/sections/[sectionId]/page";
const nodes = [
  {
    id: "legal",
    title: "Copyright",
    type: "COPYRIGHT",
    parentId: null,
    sortOrder: 0,
    wordCount: 0,
    version: 1,
    children: [],
  },
  {
    id: "toc",
    title: "Índice",
    type: "TABLE_OF_CONTENTS",
    parentId: null,
    sortOrder: 1,
    wordCount: 0,
    version: 1,
    children: [],
  },
];
beforeEach(() => fixture.getSection.mockResolvedValue(fixture.section));
it("la barra lateral y el árbol real enlazan ambas materias a las galerías", () => {
  const sidebar = renderToStaticMarkup(
    createElement(ManuscriptSidebar, {
      bookId: "book",
      nodes,
      activeSectionId: "chapter",
      canMove: false,
      canDelete: false,
      canCreate: false,
      collapsed: false,
      onToggle: () => {},
    }),
  );
  const tree = renderToStaticMarkup(createElement(SectionTree, { bookId: "book", nodes }));
  for (const html of [sidebar, tree]) {
    expect(html).toContain("/books/book/edicion?legacySection=legal#legal-title");
    expect(html).toContain("/books/book/edicion?legacySection=toc#toc-title");
    expect(html).not.toContain("/books/book/sections/legal");
  }
  expect(sidebar).toContain("/books/book/edicion#toc-title");
  expect(sidebar).toContain("/books/book/edicion#legal-title");
});
it("muestra el menú de opciones para eliminar cada parte cuando el rol tiene permiso", () => {
  const sidebar = renderToStaticMarkup(
    createElement(ManuscriptSidebar, {
      bookId: "book",
      nodes,
      activeSectionId: "chapter",
      canMove: false,
      canDelete: true,
      canCreate: false,
      collapsed: false,
      onToggle: () => {},
    }),
  );

  expect(sidebar).toContain('aria-label="Opciones de Copyright"');
  expect(sidebar).toContain('aria-label="Opciones de Índice"');
  expect(sidebar).not.toContain('class="studio-delete-section"');
});
it("explica la restricción de rol cuando no se permite eliminar partes", () => {
  const sidebar = renderToStaticMarkup(
    createElement(ManuscriptSidebar, {
      bookId: "book",
      nodes,
      activeSectionId: "chapter",
      canMove: true,
      canDelete: false,
      canCreate: false,
      collapsed: false,
      onToggle: () => {},
    }),
  );

  expect(sidebar).toContain('aria-label="Opciones de Copyright"');
  expect(sidebar).toContain('aria-expanded="false"');
  expect(sidebar).not.toContain('aria-label="Eliminar parte «Copyright»"');
});
it("una URL antigua comprueba la sección y redirige a su galería", async () => {
  await expect(
    SectionPage({
      params: Promise.resolve({ bookId: "book", sectionId: "old-legal" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("REDIRECT:/books/book/edicion?legacySection=old-legal#legal-title");
  expect(fixture.getSection).toHaveBeenCalledWith(
    expect.objectContaining({
      workspace: { id: "workspace", role: "OWNER" },
      user: { id: "user" },
    }),
    "book",
    "old-legal",
  );
});
it("la edición anterior sigue disponible por acceso explícito sin perder texto", async () => {
  const html = renderToStaticMarkup(
    await SectionPage({
      params: Promise.resolve({ bookId: "book", sectionId: "old-legal" }),
      searchParams: Promise.resolve({ editLegacy: "1" }),
    }),
  );
  expect(html).toContain("Contenido anterior conservado");
  expect(html).toContain("Abrir plantillas y vista previa");
});
