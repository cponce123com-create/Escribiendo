import { describe, expect, it } from "vitest";
import {
  paginate,
  type LaidOutPage,
  type LayoutBlock,
  type PageGeometry,
} from "@escribiendo/editorial-engine";
import {
  buildDedicationPage,
  buildLegalPage,
  tocParametersFrom,
  type TocEntry,
} from "@escribiendo/templates";
import { legalPageToBlocks, matterPageToBlocks, tocToBlocks } from "@/lib/editorial/matter-blocks";
import { bookToBlocks, type PreviewSection } from "./blocks";

/**
 * Golden de geometría de las tres páginas de referencia.
 *
 * No compara píxeles: fija la geometría compuesta (caída, cortes de línea,
 * columnas de folio y líderes) para que un cambio de motor que mueva una hoja
 * se vea como un diff explícito. La medición usa el modelo determinista del
 * motor, sin fuentes externas, de modo que el golden es estable en CI.
 */

const GEOMETRY: PageGeometry = {
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 15,
  chapterStartsRecto: false,
};

function round(value: number): number {
  return Number(value.toFixed(3));
}

function geometryOf(pages: readonly LaidOutPage[]) {
  return pages.map((page) => ({
    folio: page.folio,
    side: page.side,
    usedHeightMm: round(page.usedHeightMm),
    blocks: page.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      spaceBeforeMm: round(block.spaceBeforeMm),
      lines: block.lines.map((line) => ({
        text: line.text,
        ...(line.toc
          ? {
              folio: line.toc.text,
              xMm: round(line.toc.xMm),
              leaderStartMm: line.toc.leaderStartMm === null ? null : round(line.toc.leaderStartMm),
              leaderEndMm: line.toc.leaderEndMm === null ? null : round(line.toc.leaderEndMm),
            }
          : {}),
      })),
    })),
  }));
}

describe("golden de las páginas de referencia", () => {
  it("página legal de dos regiones", () => {
    const page = buildLegalPage({
      template: "copyright-peru-classic-reference",
      title: "El silencio de la Auvernia",
      author: "Ana Ruiz",
      rightsHolder: "Ana Ruiz",
      copyrightYear: 2026,
      editionNumber: 1,
      publicationDate: "2026-10",
      publicationCity: "Lima",
      publicationCountry: "Perú",
      publisherName: "Editorial No Para Todos",
      address: "Av. Siempre Viva 123, Lima",
      contactEmail: "hola@editorial.pe",
      isbn: "978-84-376-0494-7",
      legalDeposit: "2026-12345",
      printer: "Imprenta del Pacífico",
      printRun: 500,
    });
    const blocks = legalPageToBlocks(page, {
      id: "matter-copyright",
      sectionTitle: "Créditos",
      pageBreakBefore: true,
    });

    const result = paginate(blocks, GEOMETRY, {});

    expect(result.pages).toHaveLength(1);
    expect(geometryOf(result.pages)).toMatchSnapshot();
  });

  it("dedicatoria con plantilla clásica y posición superior", () => {
    const page = buildDedicationPage({
      text: "Para Ana, que leyó el primer borrador.\n\nCon todo mi cariño.",
      template: "classic",
      alignment: "right",
      verticalPosition: "upper",
      signature: "La autora",
    });
    const blocks = matterPageToBlocks(page, { id: "dedication", contentHeightMm: 170 });

    const result = paginate(blocks, GEOMETRY, {});

    expect(result.pages).toHaveLength(1);
    expect(geometryOf(result.pages)).toMatchSnapshot();
  });

  it("índice con folios y líderes en columna", () => {
    const entries: TocEntry[] = [
      { sourceId: "s1", title: "Primera parte", level: 0, group: "body", label: "9" },
      { sourceId: "s2", title: "El silencio", level: 1, group: "body", label: "11" },
      { sourceId: "s3", title: "La casa vacía", level: 1, group: "body", label: "27" },
      { sourceId: "s4", title: "Apéndice", level: 1, group: "back", label: "113" },
    ];
    const blocks = tocToBlocks(entries, {
      id: "matter-toc",
      sectionTitle: "Índice",
      pageBreakBefore: true,
      parameters: tocParametersFrom({ tocTemplate: "toc-standard" }),
    });

    const result = paginate(blocks, GEOMETRY, {});

    expect(geometryOf(result.pages)).toMatchSnapshot();
  });

  it("compone un libro de 250 capítulos sin desbordes", () => {
    const paragraph = "El silencio ocupaba la casa y nadie se atrevía a nombrarlo.";
    const sections: PreviewSection[] = Array.from({ length: 250 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      title: `Capítulo ${index + 1}`,
      type: "CHAPTER",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: paragraph }] }],
      },
      isChapter: true,
      startOnOddPage: false,
      pageBreakBefore: true,
      includeInExport: true,
      showInToc: true,
      showTitle: true,
      showSectionType: false,
      showSectionNumber: false,
    }));
    const blocks: LayoutBlock[] = bookToBlocks(sections);

    const result = paginate(blocks, GEOMETRY, {});

    expect(result.pages.length).toBeGreaterThanOrEqual(250);
    expect(result.diagnostics.filter((item) => item.code === "OVERFLOW")).toEqual([]);
  });
});
