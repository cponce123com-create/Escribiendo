import { describe, expect, it } from "vitest";
import {
  editionLabel,
  formatPublicationDate,
  isbn10CheckDigit,
  isbn10To13,
  isbn13CheckDigit,
  normalizeIsbn,
  parsePublicationDate,
  validateIsbn,
} from "./legal-page";
import { buildLegalPage } from "./legal-page";

/** Un ISBN-13 real y válido, usado solo como dato de prueba. */
const VALID_ISBN_13 = "978-84-376-0494-7";
const VALID_ISBN_10 = "84-376-0494-X";

const COMPLETE_PERU_PAGE = {
  template: "copyright-peru-author" as const,
  title: "La ciudad y los perros",
  author: "Mario Vargas Llosa",
  rightsHolder: "Mario Vargas Llosa",
  copyrightYear: 2026,
  editionNumber: 1,
  publicationDate: "2026-10",
  publicationCity: "Lima",
  publicationCountry: "Perú",
  publisherName: "Editorial No Para Todos",
  address: "Av. Siempre Viva 123, Lima",
  isbn: VALID_ISBN_13,
  legalDeposit: "2026-12345",
  printer: "Imprenta del Pacífico",
  printRun: 1000,
};

describe("validación de ISBN", () => {
  it("acepta un ISBN-13 con dígito de control correcto", () => {
    const result = validateIsbn(VALID_ISBN_13);
    expect(result.valid).toBe(true);
    expect(result.format).toBe("ISBN-13");
    expect(result.normalized).toBe("9788437604947");
  });

  it("rechaza un ISBN-13 con dígito de control incorrecto", () => {
    const result = validateIsbn("978-84-376-0494-8");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("control");
  });

  it("rechaza prefijos que no son 978 ni 979", () => {
    const first12 = "123456789012";
    const invalid = `${first12}${isbn13CheckDigit(first12)}`;
    const result = validateIsbn(invalid);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("prefijo");
  });

  it("acepta un ISBN-10 con X como dígito de control", () => {
    const result = validateIsbn(VALID_ISBN_10);
    expect(result.valid).toBe(true);
    expect(result.format).toBe("ISBN-10");
    expect(isbn10CheckDigit("843760494")).toBe("X");
  });

  it("normaliza guiones y espacios sin alterar el valor", () => {
    expect(normalizeIsbn(" 978 84-376 0494 7 ")).toBe("9788437604947");
  });

  it("convierte un ISBN-10 válido a ISBN-13", () => {
    expect(isbn10To13(VALID_ISBN_10)).toBe("9788437604947");
    expect(isbn10To13("978-84-376-0494-7")).toBeNull();
  });

  it("marca como inválido un valor vacío o con letras", () => {
    expect(validateIsbn("").valid).toBe(false);
    expect(validateIsbn("978-84-376-049A-7").valid).toBe(false);
  });
});

describe("fechas y ediciones", () => {
  it("interpreta año, mes y día", () => {
    expect(parsePublicationDate("2026")).toEqual({ year: 2026, month: null, day: null });
    expect(parsePublicationDate("2026-10")).toEqual({ year: 2026, month: 10, day: null });
    expect(parsePublicationDate("2026-10-23")).toEqual({ year: 2026, month: 10, day: 23 });
    expect(parsePublicationDate("2026-13")).toBeNull();
    expect(parsePublicationDate("octubre")).toBeNull();
  });

  it("formatea en español sin depender del locale del sistema", () => {
    expect(formatPublicationDate("2026-10")).toBe("octubre de 2026");
    expect(formatPublicationDate("2026")).toBe("2026");
    expect(formatPublicationDate("")).toBe("");
  });

  it("etiqueta las ediciones con palabras hasta la décima", () => {
    expect(editionLabel(1)).toBe("Primera edición");
    expect(editionLabel(10)).toBe("Décima edición");
    expect(editionLabel(12)).toBe("12.ª edición");
    expect(editionLabel(null)).toBe("");
  });
});

describe("página legal", () => {
  it("compone una página peruana completa", () => {
    const result = buildLegalPage(COMPLETE_PERU_PAGE);
    const text = result.blocks.map((block) => block.text).join("\n");

    expect(result.ready).toBe(true);
    expect(text).toContain("© 2026 Mario Vargas Llosa");
    expect(text).toContain("Primera edición");
    expect(text).toContain("ISBN: 978-84-376-0494-7");
    expect(text).toContain("Biblioteca Nacional del Perú N.º 2026-12345");
    expect(text).toContain("Impreso por Imprenta del Pacífico");
    expect(text).toContain("Tirada: 1000 ejemplares");
  });

  it("no inventa copyright ni ISBN cuando faltan los datos", () => {
    const result = buildLegalPage({
      template: "copyright-peru-publisher",
      title: "Libro sin datos",
      author: "Autora",
    });
    const text = result.blocks.map((block) => block.text).join("\n");

    expect(text).not.toContain("©");
    expect(text).not.toContain("ISBN");
    expect(text).not.toContain("Depósito Legal");
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["DERECHOS_SIN_TITULAR", "DEPOSITO_PENDIENTE"]),
    );
  });

  it("considera error un ISBN inválido y bloquea la página", () => {
    const result = buildLegalPage({
      ...COMPLETE_PERU_PAGE,
      isbn: "978-84-376-0494-8",
    });
    expect(result.ready).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ISBN_INVALIDO", severity: "error" }),
      ]),
    );
  });

  it("exige título y autoría", () => {
    const result = buildLegalPage({ template: "copyright-international", title: "", author: "" });
    expect(result.ready).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["FALTA_TITULO", "FALTA_AUTOR"]),
    );
  });

  it("en digital no imprime imprenta ni tiraje", () => {
    const result = buildLegalPage(
      {
        template: "copyright-digital",
        title: "Obra digital",
        author: "Autora",
        rightsHolder: "Autora",
        copyrightYear: 2026,
        publicationDate: "2026-10",
        isbn: VALID_ISBN_13,
        printer: "Imprenta que no debe aparecer",
        printRun: 500,
        digitalPlatform: "Librería Digital",
      },
      { mode: "print" },
    );
    const text = result.blocks.map((block) => block.text).join("\n");
    expect(text).not.toContain("Imprenta que no debe aparecer");
    expect(text).not.toContain("Tirada");
    expect(text).toContain("Librería Digital");
  });

  it("avisa si la licencia personalizada está vacía", () => {
    const result = buildLegalPage({
      template: "copyright-international",
      title: "Obra",
      author: "Autora",
      license: "custom",
    });
    expect(result.ready).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LICENCIA_SIN_TEXTO" })]),
    );
  });

  it("incluye la cláusula de ficción solo cuando se declara", () => {
    const withDisclaimer = buildLegalPage({
      ...COMPLETE_PERU_PAGE,
      fictionDisclaimer: true,
    });
    const withoutDisclaimer = buildLegalPage(COMPLETE_PERU_PAGE);

    expect(withDisclaimer.blocks.map((block) => block.text).join(" ")).toContain("obra de ficción");
    expect(withoutDisclaimer.blocks.map((block) => block.text).join(" ")).not.toContain(
      "obra de ficción",
    );
  });

  it("imprime el depósito en trámite solo si el estado lo declara", () => {
    const result = buildLegalPage({
      ...COMPLETE_PERU_PAGE,
      legalDeposit: null,
      legalDepositStatus: "IN_PROGRESS",
    });
    const text = result.blocks.map((block) => block.text).join("\n");
    expect(text).toContain("Depósito legal en trámite");
  });

  it("separa derechos y créditos en dos regiones para el preset de referencia", () => {
    const result = buildLegalPage({
      ...COMPLETE_PERU_PAGE,
      template: "copyright-peru-classic-reference",
    });

    const top = result.blocks.filter((block) => block.region !== "bottom");
    const bottom = result.blocks.filter((block) => block.region === "bottom");
    const topText = top.map((block) => block.text).join("\n");
    const bottomText = bottom.map((block) => block.text).join("\n");

    expect(result.ready).toBe(true);
    expect(top.length).toBeGreaterThan(0);
    expect(bottom.length).toBeGreaterThan(0);
    expect(topText).toContain("© 2026 Mario Vargas Llosa");
    expect(topText).not.toContain("ISBN");
    expect(bottomText).toContain("ISBN: 978-84-376-0494-7");
    expect(bottomText).toContain("Primera edición");
    // La referencia no repite en la página legal la identidad de la portadilla.
    expect(result.blocks.some((block) => block.role === "title")).toBe(false);
    expect(result.blocks.some((block) => block.role === "author")).toBe(false);
  });

  it("no marca regiones en las plantillas de una sola zona", () => {
    const result = buildLegalPage(COMPLETE_PERU_PAGE);
    expect(result.blocks.every((block) => block.region === undefined)).toBe(true);
  });
});

describe("catálogo legal", () => {
  it("cada plantilla tiene versión y no inventa campos ausentes", async () => {
    const { LEGAL_TEMPLATE_CATALOG, missingLegalFields } = await import("./legal-page");
    expect(LEGAL_TEMPLATE_CATALOG).toHaveLength(8);
    for (const item of LEGAL_TEMPLATE_CATALOG) {
      expect(item.version).toBeGreaterThan(0);
      expect(item.requiredFields.length).toBeGreaterThan(0);
      const input = { template: item.slug, title: "", author: "" };
      expect(missingLegalFields(input).length).toBeGreaterThan(0);
      const page = buildLegalPage(input);
      expect(page.ready).toBe(false);
      expect(page.blocks.some((block) => /©|N.º undefined|2026/.test(block.text))).toBe(false);
    }
  });
  it("Creative Commons usa nombre y URL sin cláusula de derechos reservados", () => {
    const page = buildLegalPage({
      template: "copyright-creative-commons",
      title: "Obra",
      author: "Autora",
      rightsHolder: "Autora",
      copyrightYear: 2026,
      license: "cc-by",
    });
    expect(page.ready).toBe(true);
    expect(page.blocks.map((b) => b.text).join(" ")).toContain(
      "https://creativecommons.org/licenses/by/4.0/deed.es",
    );
    expect(page.blocks.map((b) => b.text).join(" ")).not.toContain("reservados");
  });
});
