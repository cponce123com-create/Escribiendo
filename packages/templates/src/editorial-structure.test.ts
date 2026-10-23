import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITORIAL_PRESET,
  auditEditorialStructure,
  flattenEditorialStructure,
  getEditorialPreset,
  resolveEditorialStructure,
} from "./editorial-structure";

describe("resolución de la estructura editorial", () => {
  it("usa el preset de novela por defecto", () => {
    const structure = resolveEditorialStructure();
    expect(DEFAULT_EDITORIAL_PRESET).toBe("novela-estandar");
    expect(structure.preset.slug).toBe("novela-estandar");
    expect(structure.preset.tocDepth).toBe("chapters-h1");
  });

  it("activa las materias obligatorias del preset", () => {
    const structure = resolveEditorialStructure({ preset: "novela-estandar" });
    const titlePage = structure.front.find((slot) => slot.kind === "TITLE_PAGE");
    const copyright = structure.front.find((slot) => slot.kind === "COPYRIGHT");

    expect(titlePage).toMatchObject({ enabled: true, required: true });
    expect(copyright).toMatchObject({ enabled: true, required: true });
  });

  it("una preferencia no puede desactivar una materia obligatoria", () => {
    const structure = resolveEditorialStructure({
      preset: "novela-estandar",
      overrides: { TITLE_PAGE: { enabled: false } },
    });
    expect(structure.front.find((slot) => slot.kind === "TITLE_PAGE")?.enabled).toBe(true);
  });

  it("las preferencias activan y retitulan materias opcionales", () => {
    const structure = resolveEditorialStructure({
      preset: "novela-estandar",
      overrides: {
        DEDICATION: { enabled: true, title: "Para quien lee" },
      },
    });
    const dedication = structure.front.find((slot) => slot.kind === "DEDICATION");

    expect(dedication?.enabled).toBe(true);
    expect(dedication?.title).toBe("Para quien lee");
  });

  it("no permite reordenar: el orden lo manda el preset", () => {
    const structure = resolveEditorialStructure({
      preset: "novela-estandar",
      overrides: { COPYRIGHT: { title: "Créditos legales" } },
    });
    const kinds = flattenEditorialStructure(structure).map((slot) => slot.kind);

    expect(kinds.indexOf("TITLE_PAGE")).toBeLessThan(kinds.indexOf("COPYRIGHT"));
    expect(kinds.indexOf("COPYRIGHT")).toBeLessThan(kinds.indexOf("TABLE_OF_CONTENTS"));
  });

  it("asigna versión a las plantillas versionadas", () => {
    const structure = resolveEditorialStructure({ preset: "novela-estandar" });
    const titlePage = structure.front.find((slot) => slot.kind === "TITLE_PAGE");
    expect(titlePage?.templateSlug).toBe("title-classic");
    expect(titlePage?.templateVersion).toBe(1);
  });

  it("el índice se marca como elegible según la definición", () => {
    const structure = resolveEditorialStructure({ preset: "novela-estandar" });
    expect(structure.front.find((slot) => slot.kind === "TABLE_OF_CONTENTS")?.showInToc).toBe(false);
    expect(structure.front.find((slot) => slot.kind === "DEDICATION")?.showInToc).toBe(true);
  });

  it("el preset académico pide índice detallado", () => {
    expect(getEditorialPreset("ensayo-academico").tocDepth).toBe("chapters-h1-h2");
  });
});

describe("auditoría de la estructura", () => {
  it("avisa de un índice activo sin cuerpo", () => {
    const structure = resolveEditorialStructure({ preset: "novela-estandar" });
    const diagnostics = auditEditorialStructure(structure, {
      hasBodySections: false,
      hasRightsHolder: true,
      hasIsbn: true,
      hasPublicationYear: true,
    });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("INDICE_SIN_CUERPO");
  });

  it("avisa de derechos incompletos", () => {
    const structure = resolveEditorialStructure({ preset: "novela-estandar" });
    const diagnostics = auditEditorialStructure(structure, {
      hasBodySections: true,
      hasRightsHolder: false,
      hasIsbn: false,
      hasPublicationYear: false,
    });
    const codes = diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toEqual(
      expect.arrayContaining(["DERECHOS_SIN_TITULAR", "DERECHOS_SIN_ANIO", "DERECHOS_SIN_ISBN"]),
    );
  });

  it("detecta una materia manual activa sin sección enlazada", () => {
    const structure = resolveEditorialStructure({
      preset: "novela-literaria",
      overrides: { PROLOGUE: { enabled: true } },
    });
    const diagnostics = auditEditorialStructure(structure, {
      hasBodySections: true,
      hasRightsHolder: true,
      hasIsbn: true,
      hasPublicationYear: true,
    });
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MATERIA_SIN_SECCION", kind: "PROLOGUE" }),
      ]),
    );
  });

  it("no duplica materias al aplanar la estructura", () => {
    const structure = resolveEditorialStructure({ preset: "novela-estandar" });
    const flat = flattenEditorialStructure(structure);
    expect(new Set(flat.map((slot) => slot.kind)).size).toBe(flat.length);
  });
});
