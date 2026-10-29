import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/books/actions", () => ({
  deleteSectionAction: vi.fn(),
  moveSectionAction: vi.fn(),
}));
vi.mock("@/lib/books/manuscript-search-actions", () => ({
  searchBookManuscriptAction: vi.fn(),
  replaceBookManuscriptAction: vi.fn(),
}));
vi.mock("@/lib/writing/actions", () => ({ createNoteAction: vi.fn() }));
vi.mock("./new-section-form", () => ({ NewSectionForm: () => null }));
import { StudioInspector } from "./studio-inspector";
import { ManuscriptWorkspace } from "./manuscript-workspace";
const inspector = () =>
  createElement(StudioInspector, {
    bookId: "b",
    sectionId: "s",
    canEdit: true,
    notes: [],
    history: createElement("p", null, "Historial de ejemplo"),
    details: createElement("p", null, "Detalles de ejemplo"),
  });
it("muestra una herramienta a la vez, sin notas ni historial duplicados bajo la búsqueda", () => {
  const html = renderToStaticMarkup(inspector());
  expect(html).toContain("Buscar en el libro");
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-selected="true"');
  expect(html).not.toContain("Historial de ejemplo");
  expect(html).not.toContain("Notas rápidas");
  expect(html).not.toContain("Aplicar sugerencia");
});
it("ofrece controles móviles vinculados a paneles y conserva el editor", () => {
  const html = renderToStaticMarkup(
    createElement(ManuscriptWorkspace, {
      bookId: "b",
      nodes: [],
      activeSectionId: "s",
      canMove: true,
      canDelete: true,
      canCreate: true,
      editor: createElement("p", null, "Texto del manuscrito"),
      details: inspector(),
    }),
  );
  expect(html).toContain('aria-label="Paneles del editor"');
  expect(html).toContain('aria-controls="studio-manuscript-navigation"');
  expect(html).toContain('id="studio-manuscript-navigation"');
  expect(html).toContain('aria-controls="studio-editorial-panel"');
  expect(html).toContain('id="studio-editorial-panel"');
  expect(html).toContain("Texto del manuscrito");
});
