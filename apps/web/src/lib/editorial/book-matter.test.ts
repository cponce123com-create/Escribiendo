import { expect, it, vi } from "vitest";
import type { LegalPageInput } from "@escribiendo/templates";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import {
  assertLegalReady,
  composeMatter,
  legalPageErrors,
  LegalPageInvalidError,
  sectionsForMatter,
  type BookMatter,
} from "./book-matter";
const matter: BookMatter = {
  tocSources: [{ id: "chapter", title: "Capítulo", level: 1, group: "body", showInToc: true }],
  tocOptions: { depth: "chapters-h1" },
  legal: null,
  dropCap: { enabled: false, lines: 3 },
  legalMode: "print",
  hasTocSection: true,
  hasCopyrightSection: false,
};
it("un índice antiguo no apaga el automático sin modo MANUAL explícito", () => {
  expect(
    composeMatter(matter, new Map([["chapter", 12]])).front[0]?.blocks.some(
      (block) => block.tocEntry?.label === "12",
    ),
  ).toBe(true);
  expect(composeMatter({ ...matter, tocMode: "MANUAL" }, new Map()).front).toEqual([]);
});
const invalidLegal: LegalPageInput = {
  template: "copyright-international",
  title: "Libro",
  author: "Ana",
  isbn: "123",
};

it("una página legal habilitada con errores bloquea la exportación", () => {
  const legal: BookMatter = {
    ...matter,
    legal: invalidLegal,
    legalPageMode: "TEMPLATE",
    hasCopyrightSection: false,
  };

  expect(legalPageErrors(legal)).toEqual([expect.stringContaining("ISBN")]);
  expect(() => assertLegalReady(legal)).toThrow(LegalPageInvalidError);
});

it("no valida la página legal desactivada, manual o sustituida por una sección", () => {
  expect(legalPageErrors({ ...matter, legal: invalidLegal, legalPageMode: "DISABLED" })).toEqual(
    [],
  );
  expect(legalPageErrors({ ...matter, legal: invalidLegal, legalPageMode: "MANUAL" })).toEqual([]);
  expect(legalPageErrors({ ...matter, legal: invalidLegal, hasCopyrightSection: true })).toEqual(
    [],
  );
});

it("compone el logotipo resuelto en la página legal", () => {
  const logoUrl = "https://res.cloudinary.com/demo/image/upload/logo.png";
  const legal: LegalPageInput = {
    template: "copyright-international",
    title: "Libro",
    author: "Ana",
    logoUrl,
  };
  const front = composeMatter(
    {
      ...matter,
      legal,
      legalPageMode: "TEMPLATE",
      logoImage: { src: logoUrl, widthPx: 120, heightPx: 40, widthPercent: 25 },
    },
    new Map(),
  ).front;
  const legalLayout = front.find((item) => item.id === "matter-copyright");

  expect(
    legalLayout?.blocks.some((block) => block.kind === "image" && block.image?.src === logoUrl),
  ).toBe(true);
});

it("cambiar modos legales excluye de la salida sin modificar secciones", () => {
  const sections = [
    { id: "legal", type: "COPYRIGHT" },
    { id: "chapter", type: "CHAPTER" },
  ];
  expect(sectionsForMatter(sections, { ...matter, legalPageMode: "DISABLED" })).toEqual([
    sections[1],
  ]);
  expect(sections).toHaveLength(2);
});

it("los folios del índice coinciden con las páginas compuestas tras estabilizar", async () => {
  const { paginate, withTypographyDefaults } = await import("@escribiendo/editorial-engine");
  const { pageFolioBySection } = await import("./book-matter");
  const geometry = {
    pageWidthMm: 148,
    pageHeightMm: 210,
    marginTopMm: 20,
    marginBottomMm: 20,
    marginInnerMm: 18,
    marginOuterMm: 14,
  };
  const typography = withTypographyDefaults({});
  const body = [
    {
      id: "chapter-title",
      kind: "chapterTitle" as const,
      text: "Capítulo",
      sectionId: "chapter",
      firstOfSection: true,
      breaksBefore: true,
    },
    ...Array.from({ length: 45 }, (_, i) => ({
      id: `body-${i}`,
      kind: "body" as const,
      text: "Una línea de prueba con palabras para componer la página.",
      sectionId: "chapter",
    })),
  ];
  let generated = composeMatter(matter, new Map());
  let pages = paginate(
    [...generated.front.flatMap((item) => item.blocks), ...body],
    geometry,
    typography,
  ).pages;
  for (let pass = 0; pass < 5; pass++) {
    generated = composeMatter(matter, pageFolioBySection(pages));
    pages = paginate(
      [...generated.front.flatMap((item) => item.blocks), ...body],
      geometry,
      typography,
    ).pages;
  }
  const folio = pageFolioBySection(pages).get("chapter");
  expect(generated.front[0]?.blocks[1]?.tocEntry?.label).toBe(String(folio));
});
