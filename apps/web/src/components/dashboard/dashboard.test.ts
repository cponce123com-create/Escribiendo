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
  writingActivity: { wordsToday: 120, activeStreakDays: 3, wroteToday: true },
  yearProgress: { year: 2026, dayNumber: 296, daysInYear: 365, daysRemaining: 69, percent: 81.1 },
};

describe("panel editorial", () => {
  it("presenta el estado vacío sin inventar manuscritos ni habilitar creación sin permiso", () => {
    const html = renderToStaticMarkup(createElement(Dashboard, empty));
    expect(html).toContain("Tu próxima historia empieza aquí.");
    expect(html).not.toContain('href="/books/new"');
    expect(html).toContain('href="/books"');
  });
  it("muestra la barra anual visible al inicio y accesible como progreso plegable", () => {
    const html = renderToStaticMarkup(createElement(Dashboard, empty));
    expect(html).toContain('class="panel dashboard-year" open=""');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="81.1"');
    expect(html).toContain("Día 296 de 365");
    expect(html).toContain("quedan 69 días");
  });
  it("muestra palabras escritas hoy y la racha activa en una sección plegable", () => {
    const html = renderToStaticMarkup(createElement(Dashboard, empty));
    expect(html).toContain("Tu actividad de escritura");
    expect(html).toContain("Palabras escritas hoy");
    expect(html).toContain("120");
    expect(html).toContain("Racha activa");
    expect(html).toContain("3 <span>días</span>");
    expect(html).toContain("¡Hoy cuenta! Sigue sumando palabras.");
    expect(html).toContain('class="panel dashboard-year dashboard-writing-panel" open=""');
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
