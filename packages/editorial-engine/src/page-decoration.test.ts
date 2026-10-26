import { describe, expect, it } from "vitest";
import {
  formatPageNumber,
  resolveMarginBoxes,
  type PageDecorationContext,
} from "./page-decoration";

const CONTEXT: PageDecorationContext = {
  bookTitle: "El velo de la tarde",
  author: "Ana Torres",
  chapterTitle: "El regreso",
  sectionTitle: "Primera parte",
  folioLabel: "12",
  pageCount: 240,
};

describe("formatPageNumber", () => {
  it("formatea arábigos por defecto", () => {
    expect(formatPageNumber(12)).toBe("12");
  });

  it("convierte a romanos en mayúscula y minúscula", () => {
    expect(formatPageNumber(4, "roman-upper")).toBe("IV");
    expect(formatPageNumber(1994, "roman-upper")).toBe("MCMXCIV");
    expect(formatPageNumber(9, "roman-lower")).toBe("ix");
  });

  it("no inventa romanos para valores no positivos", () => {
    expect(formatPageNumber(0, "roman-upper")).toBe("0");
    expect(formatPageNumber(-3, "roman-lower")).toBe("-3");
  });
});

describe("resolveMarginBoxes", () => {
  it("sustituye los tokens conocidos", () => {
    const boxes = resolveMarginBoxes(
      {
        base: {
          "top-center": "{capitulo}",
          "bottom-center": "{folio} de {paginas}",
          "top-left": "{libro} · {autor}",
        },
      },
      CONTEXT,
      { side: "recto", first: false, blank: false },
    );

    expect(boxes).toEqual([
      { position: "top-left", text: "El velo de la tarde · Ana Torres", align: "left" },
      { position: "top-center", text: "El regreso", align: "center" },
      { position: "bottom-center", text: "12 de 240", align: "center" },
    ]);
  });

  it("aplica la capa del lado sobre la base", () => {
    const config = {
      base: { "top-center": "{libro}" },
      verso: { "top-center": "{capitulo}" },
      recto: { "top-center": "{seccion}" },
    };

    expect(
      resolveMarginBoxes(config, CONTEXT, { side: "verso", first: false, blank: false })[0]?.text,
    ).toBe("El regreso");
    expect(
      resolveMarginBoxes(config, CONTEXT, { side: "recto", first: false, blank: false })[0]?.text,
    ).toBe("Primera parte");
  });

  it("la primera página y la blanca se aplican al final", () => {
    const config = {
      base: { "top-center": "{libro}", "bottom-center": "{folio}" },
      first: { "top-center": "" },
      blank: { "bottom-center": "" },
    };

    expect(
      resolveMarginBoxes(config, CONTEXT, { side: "recto", first: true, blank: false }),
    ).toEqual([{ position: "bottom-center", text: "12", align: "center" }]);

    expect(
      resolveMarginBoxes(config, CONTEXT, { side: "verso", first: false, blank: true }),
    ).toEqual([{ position: "top-center", text: "El velo de la tarde", align: "center" }]);
  });

  it("descarta cajas vacías o solo con espacios", () => {
    const boxes = resolveMarginBoxes({ base: { "top-left": "   ", "top-right": "" } }, CONTEXT, {
      side: "recto",
      first: false,
      blank: false,
    });

    expect(boxes).toEqual([]);
  });

  it("devuelve una lista vacía sin configuración", () => {
    expect(
      resolveMarginBoxes(null, CONTEXT, { side: "recto", first: false, blank: false }),
    ).toEqual([]);
  });
});
