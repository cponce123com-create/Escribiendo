import { describe, expect, it, vi } from "vitest";
import { paginate, withTypographyDefaults, type LayoutBlock } from "@escribiendo/editorial-engine";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import {
  assertTocReliable,
  describeTocFailure,
  stabilizeComposition,
  tocDiagnostics,
  tocMismatches,
  TocNotConvergedError,
  type TocStability,
} from "./toc-stabilization";
import { composeMatter, pageFolioBySection, type BookMatter } from "./book-matter";

const MATTER: BookMatter = {
  tocSources: [{ id: "chapter", title: "Capítulo", level: 1, group: "body", showInToc: true }],
  tocOptions: { depth: "chapters-h1" },
  legal: null,
  dropCap: { enabled: false, lines: 3 },
  legalMode: "print",
  hasTocSection: true,
  hasCopyrightSection: false,
};

const GEOMETRY = {
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 14,
};

const TYPOGRAPHY = withTypographyDefaults({});

const BODY: LayoutBlock[] = [
  {
    id: "chapter",
    kind: "heading1",
    text: "Capítulo primero",
    sectionId: "chapter",
    firstOfSection: true,
    startsChapter: true,
  },
  {
    id: "chapter-body",
    kind: "body",
    text: Array.from({ length: 120 }, (_, index) => `palabra${index}`).join(" "),
    sectionId: "chapter",
  },
];

function compose(
  front: readonly { blocks: readonly LayoutBlock[] }[],
  back: readonly { blocks: readonly LayoutBlock[] }[],
): LayoutBlock[] {
  return [...front.flatMap((item) => item.blocks), ...back.flatMap((item) => item.blocks), ...BODY];
}

describe("estabilización del índice", () => {
  it("converge y deja el folio del índice igual a la página real de la sección", () => {
    const { composition, composedMatter, stability } = stabilizeComposition({
      matter: MATTER,
      geometry: GEOMETRY,
      typography: TYPOGRAPHY,
      compose,
    });

    expect(stability.converged).toBe(true);
    expect(stability.mismatches).toEqual([]);
    expect(stability.passes).toBeLessThanOrEqual(stability.maxPasses);

    const entry = composedMatter.front[0]?.blocks.find((block) => block.tocEntry)?.tocEntry;
    const folio = pageFolioBySection(composition.pages).get("chapter");

    expect(entry?.label).toBe(String(folio));
    expect(entry?.sourceId).toBe("chapter");
  });

  it("mide el coste de estabilizar un índice que ya no se mueve", () => {
    const { stability } = stabilizeComposition({
      matter: MATTER,
      geometry: GEOMETRY,
      typography: TYPOGRAPHY,
      compose,
    });

    // Dos pasadas como máximo: la inicial y la que confirma la firma.
    expect(stability.passes).toBeLessThanOrEqual(2);
  });

  it("detecta un folio anunciado que no coincide con la sección", () => {
    const pages = paginate([...compose([], []), ...BODY], GEOMETRY, TYPOGRAPHY).pages;
    const composed = {
      front: [
        {
          id: "matter-toc",
          blocks: [
            {
              id: "toc-1",
              kind: "body" as const,
              text: "Capítulo primero",
              tocEntry: {
                title: "Capítulo primero",
                label: "99",
                leaders: true,
                sourceId: "chapter",
              },
            },
          ],
        },
      ],
      back: [],
      signature: "firma",
    };

    const mismatches = tocMismatches(composed, pages);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.sectionId).toBe("chapter");
    expect(mismatches[0]?.expected).toBe("99");
    expect(mismatches[0]?.actual).not.toBe("99");
  });
});

describe("bloqueo de exportación", () => {
  const inestable: TocStability = {
    converged: false,
    passes: 5,
    maxPasses: 5,
    mismatches: [{ sectionId: "chapter", expected: "12", actual: "14" }],
  };

  it("se niega a exportar y explica la sección y los folios", () => {
    expect(() => assertTocReliable(inestable)).toThrow(TocNotConvergedError);

    let message = "";
    try {
      assertTocReliable(inestable);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("no convergió");
    expect(message).toContain("chapter");
    expect(message).toContain("12");
    expect(message).toContain("14");
  });

  it("acepta un índice convergente y cotejado", () => {
    expect(() =>
      assertTocReliable({ converged: true, passes: 2, maxPasses: 5, mismatches: [] }),
    ).not.toThrow();
  });

  it("publica diagnósticos de error para la vista previa", () => {
    const diagnostics = tocDiagnostics(inestable);

    expect(diagnostics.map((item) => item.code)).toEqual([
      "TOC_NOT_CONVERGED",
      "TOC_FOLIO_MISMATCH",
    ]);
    expect(diagnostics.every((item) => item.severity === "error")).toBe(true);
  });

  it("describe el fallo sin prometer un archivo que no existe", () => {
    expect(describeTocFailure(inestable)).toContain("No se ha generado el archivo");
  });
});

describe("composeMatter como fuente de la firma", () => {
  it("la firma cambia cuando cambian los folios y se repite cuando no", () => {
    const first = composeMatter(MATTER, new Map([["chapter", 3]]));
    const same = composeMatter(MATTER, new Map([["chapter", 3]]));
    const other = composeMatter(MATTER, new Map([["chapter", 4]]));

    expect(first.signature).toBe(same.signature);
    expect(first.signature).not.toBe(other.signature);
  });
});
