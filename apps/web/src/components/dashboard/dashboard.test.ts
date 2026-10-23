import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard, type DashboardProps } from "./dashboard";

const empty: DashboardProps = {
  name: "Autora",
  canCreate: false,
  totals: { books: 0, words: 0, chapters: 0, members: 1 },
  books: [],
  activity: [],
  week: [],
};

describe("panel editorial", () => {
  it("presenta el estado vacío sin inventar manuscritos ni habilitar creación sin permiso", () => {
    const html = renderToStaticMarkup(createElement(Dashboard, empty));
    expect(html).toContain("Tu próxima historia empieza aquí.");
    expect(html).not.toContain('href="/books/new"');
    expect(html).toContain('href="/books"');
  });
  it("enlaza los manuscritos reales y permite crear cuando el rol lo autoriza", () => {
    const html = renderToStaticMarkup(
      createElement(Dashboard, {
        ...empty,
        canCreate: true,
        books: [
          {
            id: "libro-real",
            title: "Historia real",
            subtitle: null,
            description: null,
            status: "Borrador",
            wordCount: 200,
            chapterCount: 1,
            updated: "23 oct 2026",
          },
        ],
      }),
    );
    expect(html).toContain('href="/books/libro-real"');
    expect(html).toContain('href="/books/new"');
    expect(html).toContain("Historia real");
    expect(html).toContain("200 palabras");
  });
});
