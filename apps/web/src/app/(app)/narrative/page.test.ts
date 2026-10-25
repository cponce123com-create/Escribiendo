import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ structure: "FREE" }));
vi.mock("@/lib/story/narrative-planning-queries", () => ({
  loadNarrativePlanning: async () => ({
    book: { id: "book", narrativeStructure: fixture.structure, narrativeVersion: 0 },
    sections: [],
    characters: [],
    events: [],
    truncated: false,
  }),
}));
vi.mock("@/lib/story/narrative-planning-actions", () => ({
  updateNarrativePlanningAction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ workspace: { id: "workspace", role: "OWNER" } }),
}));
vi.mock("@/lib/story/queries", () => ({
  listStoryBooks: async () => [{ id: "book", title: "Libro" }],
  getStoryBookOption: async () => ({ id: "book", title: "Libro" }),
}));
vi.mock("@/lib/story/schema-guard", () => ({
  guardStorySchema: async (callback: () => unknown) => callback(),
}));
vi.mock("@/lib/story/narrative-queries", () => ({
  getNarrativeDashboard: async () => ({
    book: { id: "book", title: "Libro" },
    chapters: [],
    interventions: [],
    attributionPatterns: [],
    characters: [],
    relations: [],
    timeline: [],
    planning: [],
  }),
}));
import NarrativePage from "./page";
it.each([undefined, "no-existe", "constructor", "__proto__"])(
  "usa estructura libre con parámetro desconocido %s",
  async (structure) => {
    const html = renderToStaticMarkup(
      await NarrativePage({ searchParams: Promise.resolve({ book: "book", structure }) }),
    );
    expect(html).toContain("Estructura libre");
    expect(html).toContain('<option value="FREE" selected="">');
  },
);
it("muestra la estructura guardada y no la reemplaza con un parámetro de URL", async () => {
  fixture.structure = "THREE_ACTS";
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      await NarrativePage({
        searchParams: Promise.resolve({ book: "book", structure: "THREE_ACTS" }),
      }),
    ),
  );
  expect(html).toContain("Estructura narrativa guardada");
  expect(html).toContain('<option value="THREE_ACTS" selected="">');
});
