import { describe, expect, it } from "vitest";
import { SYSTEM_TEMPLATES } from "@escribiendo/templates";
import { applyEditionDecoration, decorationFromSettings } from "./decoration";

const BASE = SYSTEM_TEMPLATES[0]!.config;

describe("decorationFromSettings", () => {
  it("lee la decoración guardada", () => {
    expect(
      decorationFromSettings({
        decoration: {
          folioPosition: "bottomOuter",
          pageNumbering: "roman-lower",
          marginBoxes: { "top-center": "{capitulo}" },
        },
      }),
    ).toEqual({
      folioPosition: "bottomOuter",
      pageNumbering: "roman-lower",
      marginBoxes: { "top-center": "{capitulo}" },
    });
  });

  it("ignora datos ausentes o inválidos", () => {
    expect(decorationFromSettings(null)).toEqual({});
    expect(decorationFromSettings({})).toEqual({});
    expect(decorationFromSettings({ decoration: { pageNumbering: "griego" } })).toEqual({});
  });
});

describe("applyEditionDecoration", () => {
  it("devuelve la misma configuración sin decoración", () => {
    expect(applyEditionDecoration(BASE, {})).toBe(BASE);
  });

  it("sobrescribe folio y numeración", () => {
    const result = applyEditionDecoration(BASE, {
      folioPosition: "topOuter",
      pageNumbering: "roman-upper",
    });

    expect(result.folioPosition).toBe("topOuter");
    expect(result.pageNumbering).toBe("roman-upper");
    expect(result.typography).toBe(BASE.typography);
  });

  it("fusiona las cajas base con las de la plantilla", () => {
    const conPlantilla = {
      ...BASE,
      marginBoxes: { base: { "top-left": "{autor}" }, verso: { "top-left": "{libro}" } },
    };

    const result = applyEditionDecoration(conPlantilla, {
      marginBoxes: { "top-center": "{capitulo}" },
    });

    expect(result.marginBoxes).toEqual({
      base: { "top-left": "{autor}", "top-center": "{capitulo}" },
      verso: { "top-left": "{libro}" },
    });
  });

  it("fusiona páginas maestras y su mapeo por sección", () => {
    const conPlantilla = {
      ...BASE,
      pageMasters: { apendice: { marginInnerMm: 20 } },
      sectionMasters: { APPENDIX: "apendice" },
    };

    const result = applyEditionDecoration(conPlantilla, {
      pageMasters: {
        apendice: { marginInnerMm: 30 },
        laminas: { pageWidthMm: 200 },
      },
      sectionMasters: { GLOSSARY: "apendice" },
    });

    expect(result.pageMasters).toEqual({
      apendice: { marginInnerMm: 30 },
      laminas: { pageWidthMm: 200 },
    });
    expect(result.sectionMasters).toEqual({
      APPENDIX: "apendice",
      GLOSSARY: "apendice",
    });
  });
});
