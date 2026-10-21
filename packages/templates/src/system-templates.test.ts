import { describe, expect, it } from "vitest";
import { validateLayoutGeometry } from "@escribiendo/editorial-engine";
import {
  DEFAULT_TEMPLATE_PAGE_PRESET,
  SYSTEM_TEMPLATES,
  templatePagePreset,
} from "./system-templates";

/**
 * La plantilla es la única decisión de la maquetación: su geometría tiene que
 * estar completa y ser válida para que la aplicación pueda derivar el perfil
 * sin pedirle medidas a quien escribe.
 */
describe("geometría predeterminada de las plantillas", () => {
  it("cada plantilla de sistema trae una geometría válida", () => {
    for (const template of SYSTEM_TEMPLATES) {
      const result = validateLayoutGeometry(template.page);
      const errors = result.issues.filter((issue) => issue.severity === "error");

      expect(errors, `${template.name}: ${errors.map((issue) => issue.message).join(" ")}`).toEqual(
        [],
      );
    }
  });

  it("Novela usa A5 con los márgenes de la maqueta de referencia", () => {
    expect(templatePagePreset("novela")).toMatchObject({
      format: "A5",
      pageWidthMm: 148,
      pageHeightMm: 210,
      marginTopMm: 20,
      marginBottomMm: 20,
      marginInnerMm: 18,
      marginOuterMm: 14,
      headerDistanceMm: 10,
      footerDistanceMm: 10,
      mirrorMargins: true,
      chapterStartsRecto: true,
    });
  });

  it("las plantillas propias reciben la geometría neutra", () => {
    expect(templatePagePreset("novela", false)).toEqual(DEFAULT_TEMPLATE_PAGE_PRESET);
    expect(templatePagePreset("plantilla-propia")).toEqual(DEFAULT_TEMPLATE_PAGE_PRESET);
  });
});
