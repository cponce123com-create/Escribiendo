import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  paginate,
  type LayoutBlock,
  type PageGeometry,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import type { ExportImageMap } from "@escribiendo/export-engine";
import type { LayoutProfileSummary } from "@/lib/layout/profiles";
import { outlineFromPages, toPdfPages } from "./pdf-pages";

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

const TIPOGRAFIA: TypographyConfig = {
  ...DEFAULT_TYPOGRAPHY_CONFIG,
  body: {
    ...DEFAULT_TYPOGRAPHY_CONFIG.body,
    fontSizePt: 10,
    lineHeight: 1,
  },
  heading1: {
    ...DEFAULT_TYPOGRAPHY_CONFIG.heading1,
    fontSizePt: 20,
    lineHeight: 1.2,
  },
};

const PERFIL: LayoutProfileSummary = {
  id: "perfil-1",
  name: "Prueba",
  format: "A5" as LayoutProfileSummary["format"],
  pageWidthMm: GEOMETRY.pageWidthMm,
  pageHeightMm: GEOMETRY.pageHeightMm,
  marginTopMm: GEOMETRY.marginTopMm,
  marginBottomMm: GEOMETRY.marginBottomMm,
  marginInnerMm: GEOMETRY.marginInnerMm,
  marginOuterMm: GEOMETRY.marginOuterMm,
  gutterMm: GEOMETRY.gutterMm ?? 0,
  bleedMm: 3,
  headerDistanceMm: GEOMETRY.headerDistanceMm ?? 0,
  footerDistanceMm: GEOMETRY.footerDistanceMm ?? 0,
  mirrorMargins: false,
  showPageNumbers: true,
  chapterStartsRecto: false,
  isDefault: false,
  typography: TIPOGRAFIA,
  usedBy: 0,
};

const SIN_IMAGENES: ExportImageMap = new Map();

function palabras(count: number): string {
  return Array.from({ length: count }, (_, index) => `palabra${index}`).join(" ");
}

function componer(blocks: LayoutBlock[]) {
  const composition = paginate(blocks, GEOMETRY, TIPOGRAFIA);
  const conversion = toPdfPages({
    pages: composition.pages,
    profile: PERFIL,
    typography: TIPOGRAFIA,
    images: SIN_IMAGENES,
    bleedMm: 0,
  });

  return { composition, ...conversion };
}

describe("toPdfPages", () => {
  it("dibuja el titulo editorial en negrita y no lo repite como encabezado", () => {
    const { composition, pdfPages } = componer([
      {
        id: "t1",
        kind: "title",
        text: "Prologo",
        sectionId: "s1",
        sectionTitle: "Prologo",
        startsChapter: true,
      },
      {
        id: "b1",
        kind: "firstParagraph",
        text: "Primera linea.",
        sectionId: "s1",
        sectionTitle: "Prologo",
      },
    ]);

    const pagina = pdfPages[0];
    const titulo = pagina?.runs.find((run) => run.text === "Prologo");
    const encabezado = pagina?.runs.find((run) => run.sizePt === 8);

    expect(composition.pages[0]?.runningHead).toBeNull();
    expect(titulo?.font).toBe("bold");
    expect(titulo?.sizePt).toBe(20);
    expect(encabezado).toBeUndefined();
  });

  it("dibuja el encabezado de la seccion en las paginas siguientes", () => {
    const { composition, pdfPages } = componer([
      {
        id: "t1",
        kind: "title",
        text: "Capitulo uno",
        sectionId: "s1",
        sectionTitle: "Capitulo uno",
        startsChapter: true,
      },
      {
        id: "b1",
        kind: "firstParagraph",
        text: palabras(400),
        sectionId: "s1",
        sectionTitle: "Capitulo uno",
      },
    ]);

    expect(composition.pages.length).toBeGreaterThan(1);
    expect(pdfPages[0]?.runs.some((run) => run.sizePt === 8)).toBe(false);
    expect(
      pdfPages[1]?.runs.some((run) => run.text === "Capitulo uno" && run.sizePt === 8),
    ).toBe(true);
  });

  it("no añade sangrado al PDF digital", () => {
    const { pdfPages } = componer([
      {
        id: "b1",
        kind: "body",
        text: "Texto.",
        sectionId: "s1",
        sectionTitle: "Capitulo",
      },
    ]);

    expect(pdfPages[0]?.widthMm).toBe(GEOMETRY.pageWidthMm);
    expect(pdfPages[0]?.bleedMm).toBe(0);
  });

  it("conserva el espacio posterior de un separador antes del texto siguiente", () => {
    const tipografia: TypographyConfig = {
      ...TIPOGRAFIA,
      body: { ...TIPOGRAFIA.body, spaceAfterPt: 10 },
    };
    const composition = paginate(
      [
        { id: "r1", kind: "rule", text: "", sectionId: "s1", sectionTitle: "Capitulo" },
        { id: "b1", kind: "body", text: "Despues.", sectionId: "s1", sectionTitle: "Capitulo" },
      ],
      GEOMETRY,
      tipografia,
    );
    const { pdfPages } = toPdfPages({
      pages: composition.pages,
      profile: PERFIL,
      typography: tipografia,
      images: SIN_IMAGENES,
      bleedMm: 0,
    });
    const regla = pdfPages[0]?.runs.find((run) => run.text === "* * *");
    const texto = pdfPages[0]?.runs.find((run) => run.text === "Despues.");

    expect(regla).toBeDefined();
    expect(texto).toBeDefined();
    expect((texto?.baselineMm ?? 0) - (regla?.baselineMm ?? 0)).toBeGreaterThan(3.5);
  });

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
      TIPOGRAFIA,
    );
    const outline = outlineFromPages(composition.pages, [
      { id: "s1", title: "Prologo", showInToc: true },
      { id: "s2", title: "Capitulo oculto", showInToc: false },
    ]);

    expect(outline).toEqual([{ title: "Prologo", pageIndex: 0 }]);
  });

  it("conserva cada linea y su posicion vertical al convertir la vista previa", () => {
    const composition = paginate(
      [
        {
          id: "b1",
          kind: "body",
          text: palabras(320),
          sectionId: "s1",
          sectionTitle: "Capitulo",
        },
      ],
      GEOMETRY,
      TIPOGRAFIA,
    );
    const { pdfPages } = toPdfPages({
      pages: composition.pages,
      profile: PERFIL,
      typography: TIPOGRAFIA,
      images: SIN_IMAGENES,
      bleedMm: 0,
    });

    expect(composition.pages.length).toBeGreaterThan(1);

    for (const [pageIndex, page] of composition.pages.entries()) {
      const runs = pdfPages[pageIndex]?.runs ?? [];
      let y = PERFIL.marginTopMm;

      for (const block of page.blocks) {
        y += block.spaceBeforeMm;
        const alturaLinea = (block.style.fontSizePt * block.style.lineHeight * 25.4) / 72;

        for (const line of block.lines) {
          const baseline = y + alturaLinea * 0.8;
          const mismoTexto = runs.some(
            (run) => run.text === line.text && Math.abs(run.baselineMm - baseline) < 0.01,
          );

          expect(mismoTexto, `Falta la linea «${line.text}» en su posicion`).toBe(true);
          y += alturaLinea;
        }

        y += block.spaceAfterMm;
      }
    }
  });

  it("transmite el espaciado entre caracteres al escritor de PDF", () => {
    const tipografia: TypographyConfig = {
      ...TIPOGRAFIA,
      body: { ...TIPOGRAFIA.body, letterSpacingPt: 1 },
    };
    const composition = paginate(
      [{ id: "b1", kind: "body", text: "Texto espaciado.", sectionId: "s1", sectionTitle: "C" }],
      GEOMETRY,
      tipografia,
    );
    const { pdfPages } = toPdfPages({
      pages: composition.pages,
      profile: PERFIL,
      typography: tipografia,
      images: SIN_IMAGENES,
      bleedMm: 0,
    });

    expect(pdfPages[0]?.runs.find((run) => run.text === "Texto espaciado.")?.letterSpacingPt).toBe(1);
  });
});
