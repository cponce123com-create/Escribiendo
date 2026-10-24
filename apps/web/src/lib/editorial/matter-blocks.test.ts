import { describe, expect, it } from "vitest";
import type { LayoutDiagnostic } from "@escribiendo/editorial-engine";
import {
  buildDedicationPage,
  buildTitlePage,
  type LegalPageResult,
  type TocEntry,
} from "@escribiendo/templates";
import {
  legalPageToBlocks,
  matterPageToBlocks,
  roleBlocksToBlocks,
  tocToBlocks,
} from "./matter-blocks";

/**
 * La conversión es la frontera entre el dominio editorial y el motor: estas
 * pruebas fijan qué se compone, con qué alineación y qué se descarta.
 */

describe("roleBlocksToBlocks", () => {
  it("traduce los papeles de una portadilla a clases tipográficas", () => {
    const page = buildTitlePage({
      title: "La ciudad y los perros",
      subtitle: "Novela",
      author: "Mario Vargas Llosa",
      publisher: "Seix Barral",
      verticalPosition: "upper",
    });

    const blocks = matterPageToBlocks(page, { id: "title-page", pageBreakBefore: true });

    expect(blocks.map((block) => block.kind)).toEqual(["title", "heading2", "body", "body"]);
    expect(blocks[0]?.text).toBe("La ciudad y los perros");
    expect(blocks[0]?.alignment).toBe("center");
    expect(blocks[1]?.alignment).toBe("center");
    expect(blocks[3]?.text).toBe("Seix Barral");
    expect(blocks[0]?.breaksBefore).toBe(true);
    expect(blocks[0]?.firstOfSection).toBe(true);
    expect(blocks[1]?.firstOfSection).toBe(false);
  });

  it("no inventa bloques con los espaciadores y avisa del logo no resuelto", () => {
    const diagnostics: LayoutDiagnostic[] = [];
    const blocks = roleBlocksToBlocks(
      [
        { role: "spacer", text: "", spaceMm: 0 },
        { role: "logo", text: "https://cdn.example.com/logo.png" },
        { role: "title", text: "Título" },
      ],
      { id: "m1", diagnostics },
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe("m1-0");
    expect(blocks[0]?.firstOfSection).toBe(true);
    expect(blocks[0]?.styleOverride?.spaceBeforePt).toBeUndefined();
    expect(diagnostics.map((item) => item.code)).toEqual(["MATTER_LOGO_OMITIDO"]);
  });

  it("convierte el espacio de los espaciadores en espacio anterior del bloque siguiente", () => {
    const blocks = roleBlocksToBlocks(
      [
        { role: "spacer", text: "", spaceMm: 10 },
        { role: "spacer", text: "", spaceFraction: 0.25 },
        { role: "title", text: "Título" },
      ],
      { id: "m1", contentHeightMm: 200 },
    );

    expect(blocks).toHaveLength(1);
    // 10 mm + 25 % de 200 mm = 60 mm = 170,08 pt
    expect(blocks[0]?.styleOverride?.spaceBeforePt).toBeCloseTo((60 * 72) / 25.4, 5);
  });

  it("coloca la dedicatoria según la altura útil, no según el cuerpo de letra", () => {
    const upper = buildDedicationPage({ text: "Para Ana.", verticalPosition: "upper" });
    const lower = buildDedicationPage({ text: "Para Ana.", verticalPosition: "lower" });
    const upperBlocks = matterPageToBlocks(upper, { id: "d1", contentHeightMm: 200 });
    const lowerBlocks = matterPageToBlocks(lower, { id: "d2", contentHeightMm: 200 });

    // 12 % y 64 % de 200 mm, aplicados al primer bloque emitido (la regla).
    expect(upperBlocks[0]?.styleOverride?.spaceBeforePt).toBeCloseTo((24 * 72) / 25.4, 5);
    expect(lowerBlocks[0]?.styleOverride?.spaceBeforePt).toBeCloseTo((128 * 72) / 25.4, 5);
  });

  it("emite el logotipo como imagen cuando hay resolvedor", () => {
    const image = {
      src: "https://cdn.example.com/logo.png",
      alt: "Sello de la editorial",
      widthPx: 400,
      heightPx: 200,
    };
    const blocks = roleBlocksToBlocks(
      [
        { role: "logo", text: "https://cdn.example.com/logo.png" },
        { role: "title", text: "Título" },
      ],
      {
        id: "m1",
        resolveImage: (src) => (src === image.src ? image : null),
      },
    );

    expect(blocks[0]?.kind).toBe("image");
    expect(blocks[0]?.image?.alt).toBe("Sello de la editorial");
    expect(blocks[1]?.text).toBe("Título");
  });

  it("compone la dedicatoria centrada y la firma a la derecha", () => {
    const page = buildDedicationPage({
      text: "Para Ana, que leyó el primer borrador.",
      signature: "El autor",
    });

    const blocks = matterPageToBlocks(page, { id: "dedication" });
    const firma = blocks.at(-1);

    expect(blocks[0]?.kind).toBe("rule");
    expect(blocks.some((block) => block.alignment === "right")).toBe(true);
    expect(firma?.text).toBe("El autor");
    expect(firma?.alignment).toBe("right");
  });

  it("compone los tramos en cursiva con sus marcas", () => {
    const blocks = roleBlocksToBlocks([{ role: "italic", text: "Una cita" }], { id: "epigraph" });

    expect(blocks[0]?.text).toBe("Una cita");
    expect(blocks[0]?.runs).toEqual([{ text: "Una cita", marks: { italic: true } }]);
  });

  it("no compone una materia marcada como no lista", () => {
    const page = buildTitlePage({ title: "", author: "" });

    expect(page.ready).toBe(false);
    expect(matterPageToBlocks(page, { id: "empty" })).toEqual([]);
  });
});

describe("legalPageToBlocks", () => {
  it("conserva las líneas legales y su alineación izquierda", () => {
    const result: LegalPageResult = {
      template: "copyright-peru-author",
      templateVersion: 1,
      ready: true,
      warnings: [],
      blocks: [
        { role: "title", text: "La ciudad y los perros" },
        { role: "author", text: "Mario Vargas Llosa" },
        { role: "rule", text: "" },
        { role: "small", text: "© 1963, Mario Vargas Llosa" },
        { role: "body", text: "Queda prohibida la reproducción total o parcial." },
      ],
    };

    const blocks = legalPageToBlocks(result, { id: "copyright", pageBreakBefore: true });

    expect(blocks.map((block) => block.kind)).toEqual(["title", "body", "rule", "body", "body"]);
    expect(blocks[0]?.alignment).toBe("center");
    expect(blocks[3]?.alignment).toBe("left");
    expect(blocks[3]?.text).toContain("© 1963");
  });
});

describe("tocToBlocks", () => {
  const entry = (overrides: Partial<TocEntry>): TocEntry => ({
    sourceId: "s1",
    title: "Capítulo primero",
    level: 1,
    group: "body",
    label: "15",
    ...overrides,
  });

  it("abre con el título del índice y respeta la página calculada", () => {
    const blocks = tocToBlocks([entry({})], {
      id: "toc",
      pageBreakBefore: true,
      heading: "Índice",
    });

    expect(blocks[0]?.kind).toBe("chapterTitle");
    expect(blocks[0]?.text).toBe("Índice");
    expect(blocks[0]?.breaksBefore).toBe(true);
    expect(blocks[1]?.text).toBe("Capítulo primero");
    expect(blocks[1]?.text).not.toContain(".");
    expect(blocks[1]?.tocEntry?.label).toBe("15");
  });

  it("no numera una entrada sin etiqueta", () => {
    const blocks = tocToBlocks([entry({ label: null })], { id: "toc" });
    const linea = blocks[1];

    expect(linea?.text).toBe("Capítulo primero");
    expect(linea?.text).not.toContain(".");
  });

  it("sangra los niveles anidados con espacios em", () => {
    const blocks = tocToBlocks([entry({ level: 2, title: "Apartado" })], { id: "toc" });

    expect(blocks[1]?.text?.startsWith("\u2003Apartado")).toBe(true);
  });

  it("mantiene el orden recibido de las entradas", () => {
    const blocks = tocToBlocks(
      [entry({ sourceId: "a", title: "Uno" }), entry({ sourceId: "b", title: "Dos" })],
      { id: "toc" },
    );

    expect(blocks.slice(1).map((block) => block.text?.split("\u2003")[0])).toEqual([
      expect.stringContaining("Uno"),
      expect.stringContaining("Dos"),
    ]);
  });
});

describe("diseños de índice", () => {
  it("los seis diseños producen bloques distintos y el modo sin páginas no imprime folios", async () => {
    const { TOC_TEMPLATE_CATALOG } = await import("@escribiendo/templates");
    const entries: TocEntry[] = [
      {
        sourceId: "p",
        title: "Parte inicial",
        sectionType: "PART",
        level: 0,
        group: "body",
        label: "3",
      },
      {
        sourceId: "c",
        title: "Un capítulo",
        sectionType: "CHAPTER",
        level: 1,
        group: "body",
        label: "7",
      },
      { sourceId: "h", title: "Un apartado", level: 2, group: "body", label: "8" },
    ];
    const signatures = TOC_TEMPLATE_CATALOG.map((item) =>
      JSON.stringify(tocToBlocks(entries, { id: "toc", parameters: item.parameters })),
    );
    expect(new Set(signatures).size).toBe(6);
    for (const item of TOC_TEMPLATE_CATALOG) {
      const blocks = tocToBlocks(entries, {
        id: "toc",
        parameters: { ...item.parameters, tocPageNumbers: false },
      });
      expect(blocks.some((block) => /[378]/.test(block.text))).toBe(false);
      expect(blocks.some((block) => block.tocEntry)).toBe(false);
    }
  });
});

it("la sangría jerárquica llega al motor y el folio permanece dentro del margen", async () => {
  const { paginate, withTypographyDefaults } = await import("@escribiendo/editorial-engine");
  const blocks = tocToBlocks(
    [{ sourceId: "h", title: "Apartado", level: 2, group: "body", label: "125" }],
    { id: "toc" },
  );
  const result = paginate(
    blocks,
    {
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 20,
      marginBottomMm: 20,
      marginInnerMm: 18,
      marginOuterMm: 14,
    },
    withTypographyDefaults({}),
  );
  const entry = result.pages.flatMap((page) => page.blocks).find((block) => block.id === "toc-1")!;
  expect(entry.firstLineIndentMm).toBe(4);
  const line = entry.lines.at(-1)!;
  expect(line.text).toBe("Apartado");
  const folio = line.toc!;
  expect(folio.text).toBe("125");
  expect(Math.abs(folio.xMm + folio.widthMm - result.textWidthMm)).toBeLessThanOrEqual(0.5);
});
