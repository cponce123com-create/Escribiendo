import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  paginate,
  type PageGeometry,
} from "@escribiendo/editorial-engine";
import { outlineFromPages } from "./pdf-pages";

const GEOMETRY: PageGeometry = {
  pageWidthMm: 100,
  pageHeightMm: 100,
  marginTopMm: 10,
  marginBottomMm: 10,
  marginInnerMm: 10,
  marginOuterMm: 10,
  gutterMm: 0,
  headerDistanceMm: 6,
  footerDistanceMm: 6,
  chapterStartsRecto: false,
};

describe("outlineFromPages", () => {
  it("construye los marcadores solo con las secciones visibles en el indice", () => {
    const composition = paginate(
      [
        {
          id: "t1",
          kind: "title",
          text: "Prologo",
          sectionId: "s1",
          sectionTitle: "Prologo",
          firstOfSection: true,
          startsChapter: true,
        },
        {
          id: "b1",
          kind: "body",
          text: "Cuerpo del prologo.",
          sectionId: "s1",
          sectionTitle: "Prologo",
        },
        {
          id: "t2",
          kind: "title",
          text: "Capitulo oculto",
          sectionId: "s2",
          sectionTitle: "Capitulo oculto",
          firstOfSection: true,
          startsChapter: true,
        },
      ],
      GEOMETRY,
      DEFAULT_TYPOGRAPHY_CONFIG,
    );
    const outline = outlineFromPages(composition.pages, [
      { id: "s1", title: "Prologo", showInToc: true },
      { id: "s2", title: "Capitulo oculto", showInToc: false },
    ]);

    expect(outline).toEqual([{ title: "Prologo", pageIndex: 0 }]);
  });

  it("prefiere el titulo visible compuesto cuando el bloque no es de titulo", () => {
    const composition = paginate(
      [
        {
          id: "b1",
          kind: "body",
          text: "Cuerpo sin bloque de titulo.",
          sectionId: "s1",
          sectionTitle: "Capitulo uno",
          firstOfSection: true,
        },
      ],
      GEOMETRY,
      DEFAULT_TYPOGRAPHY_CONFIG,
    );
    const outline = outlineFromPages(composition.pages, [
      { id: "s1", title: "Capitulo uno", showInToc: true, displayTitle: "I — Capitulo uno" },
    ]);

    expect(outline).toEqual([{ title: "Capitulo uno", pageIndex: 0 }]);
  });
});
