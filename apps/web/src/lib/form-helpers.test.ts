import { describe, expect, it } from "vitest";
import { errorState, formValue, successState } from "./form-helpers";

describe("form helpers", () => {
  it("lee solo campos de texto y conserva el valor sin recortarlo", () => {
    const form = new FormData();
    form.set("title", "  Una historia  ");
    form.set("file", new File(["contenido"], "libro.docx"));

    expect(formValue(form, "title")).toBe("  Una historia  ");
    expect(formValue(form, "file")).toBe("");
    expect(formValue(form, "missing")).toBe("");
  });

  it("genera estados consistentes con o sin errores por campo", () => {
    expect(errorState("Revisa el formulario.")).toEqual({
      status: "error",
      message: "Revisa el formulario.",
    });
    expect(errorState("El archivo no es válido.", { file: "Formato no admitido." })).toEqual({
      status: "error",
      message: "El archivo no es válido.",
      fieldErrors: { file: "Formato no admitido." },
    });
    expect(successState("Guardado.")).toEqual({ status: "success", message: "Guardado." });
  });
});
