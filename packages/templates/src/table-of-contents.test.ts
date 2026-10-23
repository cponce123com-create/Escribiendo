import { describe, expect, it } from "vitest";
import {
  assignTocLabels,
  auditToc,
  buildTocEntries,
  formatFolio,
  pageLabel,
  romanNumeral,
  stabilizeToc,
  tocIncludesParts,
  tocMaxLevel,
  tocSignature,
  type TocSource,
} from "./table-of-contents";

const SOURCES: TocSource[] = [
  { id: "front", title: "Prólogo", level: 0, group: "front", showInToc: true, pageLabel: "vii" },
  { id: "part-1", title: "Primera parte", level: 0, group: "body", showInToc: true, pageIndex: 10 },
  { id: "ch-1", title: "Capítulo 1", level: 1, group: "body", showInToc: true, pageIndex: 12 },
  { id: "sc-1", title: "Escena primera", level: 2, group: "body", showInToc: true, pageIndex: 14 },
  { id: "ch-2", title: "Capítulo 2", level: 1, group: "body", showInToc: false, pageIndex: 30 },
  { id: "appendix", title: "Apéndice", level: 1, group: "back", showInToc: true, pageIndex: 90 },
  { id: "hidden", title: "Material interno", level: 1, group: "body", showInToc: true, includeInExport: false },
];

describe("índice automático", () => {
  it("traduce la profundidad a niveles máximos", () => {
    expect(tocMaxLevel("parts-chapters")).toBe(1);
    expect(tocMaxLevel("chapters-h1")).toBe(1);
    expect(tocMaxLevel("chapters-h1-h2")).toBe(2);
    expect(tocMaxLevel("chapters-h1-h2-h3")).toBe(3);
    expect(tocIncludesParts("parts-chapters")).toBe(true);
    expect(tocIncludesParts("chapters-h1-h2")).toBe(false);
  });

  it("incluye partes solo cuando el modo lo pide", () => {
    const withParts = buildTocEntries(SOURCES, { depth: "parts-chapters" });
    const withoutParts = buildTocEntries(SOURCES, { depth: "chapters-h1" });

    expect(withParts.map((entry) => entry.sourceId)).toEqual(["front", "part-1", "ch-1", "appendix"]);
    expect(withoutParts.map((entry) => entry.sourceId)).toEqual(["front", "ch-1", "appendix"]);
  });

  it("respeta la profundidad y las exclusiones", () => {
    const entries = buildTocEntries(SOURCES, { depth: "chapters-h1-h2" });
    const ids = entries.map((entry) => entry.sourceId);

    expect(ids).toContain("sc-1");
    expect(ids).not.toContain("part-1");
    expect(ids).not.toContain("ch-2");
    expect(ids).not.toContain("hidden");
  });

  it("puede omitir preliminares y finales", () => {
    const entries = buildTocEntries(SOURCES, {
      depth: "chapters-h1",
      includeFrontMatter: false,
      includeBackMatter: false,
    });
    expect(entries.map((entry) => entry.sourceId)).toEqual(["ch-1"]);
  });

  it("no imprime entradas sin título", () => {
    const entries = buildTocEntries(
      [{ id: "empty", title: "   ", level: 1, group: "body", showInToc: true }],
      { depth: "chapters-h1" },
    );
    expect(entries).toEqual([]);
  });

  it("asigna etiquetas sin sobrescribir las que ya existen", () => {
    const entries = buildTocEntries(SOURCES, { depth: "chapters-h1" });
    const labeled = assignTocLabels(
      entries,
      new Map([
        ["ch-1", "13"],
        ["appendix", "91"],
      ]),
    );

    expect(labeled.find((entry) => entry.sourceId === "ch-1")?.label).toBe("13");
    expect(labeled.find((entry) => entry.sourceId === "front")?.label).toBe("vii");
    expect(labeled.find((entry) => entry.sourceId === "appendix")?.label).toBe("91");
  });

  it("la firma cambia cuando cambia una página", () => {
    const first = buildTocEntries(SOURCES, { depth: "chapters-h1" });
    const second = first.map((entry) =>
      entry.sourceId === "ch-1" ? { ...entry, label: "13" } : entry,
    );
    expect(tocSignature(first)).not.toBe(tocSignature(second));
  });
});

describe("folios", () => {
  it("convierte números romanos", () => {
    expect(romanNumeral(1)).toBe("I");
    expect(romanNumeral(4)).toBe("IV");
    expect(romanNumeral(9)).toBe("IX");
    expect(romanNumeral(40)).toBe("XL");
    expect(romanNumeral(1994)).toBe("MCMXCIV");
    expect(romanNumeral(3999)).toBe("MMMCMXCIX");
    expect(() => romanNumeral(0)).toThrow(RangeError);
    expect(() => romanNumeral(4000)).toThrow(RangeError);
  });

  it("numera preliminares en romanos y reinicia el cuerpo en 1", () => {
    const options = {
      frontMatterPages: 4,
      frontMatterStyle: "roman" as const,
      frontMatterLowerCase: true,
    };
    expect(pageLabel({ ...options, pageIndex: 0 })).toBe("i");
    expect(pageLabel({ ...options, pageIndex: 3 })).toBe("iv");
    expect(pageLabel({ ...options, pageIndex: 4 })).toBe("1");
    expect(pageLabel({ ...options, pageIndex: 5 })).toBe("2");
  });

  it("oculta el folio de preliminares sin romper la numeración del cuerpo", () => {
    const options = {
      frontMatterPages: 6,
      frontMatterStyle: "roman" as const,
      showFrontMatterFolios: false,
    };
    expect(pageLabel({ ...options, pageIndex: 2 })).toBeNull();
    expect(pageLabel({ ...options, pageIndex: 6 })).toBe("1");
  });

  it("no inventa folio para estilos desactivados", () => {
    expect(formatFolio(3, "none")).toBeNull();
    expect(formatFolio(3, "roman", true)).toBe("iii");
    expect(formatFolio(0, "arabic")).toBeNull();
  });
});

describe("estabilización del índice", () => {
  it("converge cuando el número de páginas y las etiquetas se repiten", () => {
    let calls = 0;
    const result = stabilizeToc({
      initialTocPages: 2,
      layout: (tocPages) => {
        calls += 1;
        return {
          entries: [
            { sourceId: "ch-1", title: "Capítulo 1", level: 1, group: "body", label: String(10 + tocPages) },
          ],
          pageCount: 2,
          signature: `sig-${tocPages}`,
        };
      },
    });

    expect(result.converged).toBe(true);
    expect(result.passes).toBe(2);
    expect(calls).toBe(2);
  });

  it("se detiene y avisa si el índice no deja de moverse", () => {
    const result = stabilizeToc({
      initialTocPages: 1,
      maxPasses: 3,
      layout: (tocPages) => ({
        entries: [
          { sourceId: "ch-1", title: "Capítulo 1", level: 1, group: "body", label: String(tocPages) },
        ],
        pageCount: tocPages + 1,
        signature: `sig-${tocPages}`,
      }),
    });

    expect(result.converged).toBe(false);
    expect(result.passes).toBe(3);
  });
});

describe("auditoría del índice", () => {
  it("detecta títulos duplicados en el mismo nivel", () => {
    const entries = buildTocEntries(
      [
        { id: "a", title: "Capítulo 1", level: 1, group: "body", showInToc: true },
        { id: "b", title: "Capítulo 1", level: 1, group: "body", showInToc: true },
      ],
      { depth: "chapters-h1" },
    );
    const warnings = auditToc(entries, { hasBodySections: true, depth: "chapters-h1" });
    expect(warnings.map((warning) => warning.code)).toContain("ENTRADA_DUPLICADA");
  });

  it("avisa de un índice vacío cuando hay cuerpo", () => {
    const warnings = auditToc([], { hasBodySections: true, depth: "chapters-h1" });
    expect(warnings.map((warning) => warning.code)).toContain("INDICE_VACIO");
  });

  it("avisa si se pidió índice por partes y no hay partes", () => {
    const entries = buildTocEntries(
      [{ id: "a", title: "Capítulo 1", level: 1, group: "body", showInToc: true }],
      { depth: "parts-chapters" },
    );
    const warnings = auditToc(entries, { hasBodySections: true, depth: "parts-chapters" });
    expect(warnings.map((warning) => warning.code)).toContain("SIN_PARTES");
  });
});
