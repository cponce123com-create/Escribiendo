import { describe, expect, it } from "vitest";
import {
  auditSingleDedication,
  buildAboutAuthorPage,
  buildColophonPage,
  buildCreditsPage,
  buildDedicationPage,
  buildEpigraphPage,
  buildOtherBooksPage,
  buildTitlePage,
  countCharacters,
  estimateWrappedLines,
  groupEpigraphsBySection,
} from "./matter-content";

describe("portada", () => {
  it("compone título, subtítulo, autoría y sello", () => {
    const page = buildTitlePage({
      title: "La ciudad y los perros",
      subtitle: "Novela",
      author: "Mario Vargas Llosa",
      publisher: "Editorial No Para Todos",
    });
    const roles = page.blocks.map((block) => block.role);
    expect(roles).toContain("title");
    expect(roles).toContain("subtitle");
    expect(roles).toContain("author");
    expect(roles).toContain("publisher");
    expect(page.ready).toBe(true);
  });

  it("no considera lista una portada sin título", () => {
    const page = buildTitlePage({ title: "", author: "Autora" });
    expect(page.ready).toBe(false);
    expect(page.blocks.some((block) => block.role === "title")).toBe(false);
  });
});

describe("dedicatoria", () => {
  it("cuenta caracteres visibles y estima líneas", () => {
    expect(countCharacters("a😀b")).toBe(3);
    expect(estimateWrappedLines("uno dos tres", 5)).toBe(3);
  });

  it("compone una dedicatoria breve", () => {
    const page = buildDedicationPage({ text: "Para Ana, que siempre lee." });
    expect(page.ready).toBe(true);
    expect(page.characters).toBe(26);
    expect(page.blocks.some((block) => block.role === "right")).toBe(true);
  });

  it("conserva la cursiva literaria con alineación a la derecha", () => {
    const page = buildDedicationPage({
      text: "Para Ana.",
      template: "literary",
      alignment: "right",
    });
    const paragraph = page.blocks.find((block) => block.text === "Para Ana.");

    expect(paragraph?.role).toBe("italic");
    expect(paragraph?.alignment).toBe("right");
  });

  it("avisa cuando la dedicatoria es demasiado larga sin recortarla", () => {
    const text = "a".repeat(600);
    const page = buildDedicationPage({ text });
    const printed = page.blocks
      .filter((block) => block.role === "right")
      .map((block) => block.text);

    expect(page.ready).toBe(true);
    expect(printed.join("")).toBe(text);
    expect(page.warnings.map((warning) => warning.code)).toContain("DEDICATORIA_EXCESIVA");
  });

  it("una dedicatoria vacía no se compone", () => {
    const page = buildDedicationPage({ text: "   " });
    expect(page.ready).toBe(false);
    expect(page.warnings.map((warning) => warning.code)).toContain("DEDICATORIA_VACIA");
  });

  it("detecta más de una dedicatoria principal", () => {
    expect(auditSingleDedication(1)).toEqual([]);
    expect(auditSingleDedication(2)[0]?.code).toBe("DEDICATORIA_DUPLICADA");
  });
});

describe("epígrafe", () => {
  it("compone cita y atribución", () => {
    const page = buildEpigraphPage({
      text: "La literatura es fuego.",
      attribution: "Mario Vargas Llosa",
      source: "Discurso de ingreso",
    });
    const text = page.blocks.map((block) => block.text).join(" ");
    expect(text).toContain("La literatura es fuego.");
    expect(text).toContain("Mario Vargas Llosa, Discurso de ingreso");
  });

  it("avisa si falta la atribución, pero imprime la cita", () => {
    const page = buildEpigraphPage({ text: "Una cita sin dueño." });
    expect(page.warnings.map((warning) => warning.code)).toContain("EPIGRAFE_SIN_ATRIBUCION");
    expect(page.ready).toBe(true);
  });

  it("agrupa epígrafes por capítulo conservando el orden", () => {
    const grouped = groupEpigraphsBySection([
      { sectionId: "a", text: "Uno" },
      { sectionId: "b", text: "Dos" },
      { sectionId: "a", text: "Tres" },
    ]);
    expect(grouped.get("a")?.map((epigraph) => epigraph.text)).toEqual(["Uno", "Tres"]);
  });
});

describe("páginas de cierre", () => {
  it("lista créditos y avisa si no hay ninguno", () => {
    const empty = buildCreditsPage({ entries: [] });
    expect(empty.warnings.map((warning) => warning.code)).toContain("CREDITOS_VACIOS");
    expect(empty.ready).toBe(true);

    const page = buildCreditsPage({
      entries: [
        { role: "Edición", name: "Ana Pérez" },
        { role: "Corrección", name: "Luis Gómez" },
      ],
    });
    expect(page.blocks.map((block) => block.text)).toEqual(
      expect.arrayContaining(["Edición: Ana Pérez", "Corrección: Luis Gómez"]),
    );
  });

  it("exige biografía en «Sobre el autor»", () => {
    const page = buildAboutAuthorPage({ name: "Autora", biography: "" });
    expect(page.ready).toBe(true);
    expect(page.warnings.map((warning) => warning.code)).toContain("AUTOR_SIN_BIOGRAFIA");
  });

  it("no inventa datos de otras obras", () => {
    const page = buildOtherBooksPage({
      books: [{ title: "Libro anterior", year: 2024 }],
    });
    const text = page.blocks.map((block) => block.text).join("\n");
    expect(text).toContain("Libro anterior");
    expect(text).toContain("2024");
    expect(text).not.toContain("https://");
  });
});

describe("colofón", () => {
  it("solo afirma el cierre de impresión cuando constan imprenta y fecha", () => {
    const page = buildColophonPage({
      printer: "Imprenta del Pacífico",
      publicationDate: "2026-10-01",
      mode: "print",
    });
    expect(page.blocks.map((block) => block.text).join(" ")).toContain("se terminó de imprimir");
    expect(page.ready).toBe(true);
  });

  it("no imprime imprenta en una edición digital", () => {
    const page = buildColophonPage({
      printer: "Imprenta que no debe aparecer",
      digitalPlatform: "Librería Digital",
      mode: "digital",
    });
    const text = page.blocks.map((block) => block.text).join("\n");
    expect(text).toContain("Edición digital");
    expect(text).toContain("Librería Digital");
    expect(text).not.toContain("Imprenta que no debe aparecer");
  });

  it("avisa cuando falta la imprenta", () => {
    const page = buildColophonPage({ mode: "print" });
    expect(page.warnings.map((warning) => warning.code)).toContain("COLOFON_SIN_IMPRENTA");
  });
});
