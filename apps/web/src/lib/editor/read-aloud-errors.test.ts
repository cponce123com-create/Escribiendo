import { describe, expect, it } from "vitest";
import { getReadAloudStartErrorMessage } from "./read-aloud-errors";

describe("getReadAloudStartErrorMessage", () => {
  it("preserva el límite de tamaño del lector nativo", () => {
    expect(
      getReadAloudStartErrorMessage(
        new Error("El manuscrito es demasiado grande para cargarlo en la lectura móvil."),
      ),
    ).toBe("El manuscrito es demasiado grande para cargarlo en la lectura móvil.");
  });

  it("explica cómo recuperarse si Android no recibe el texto del capítulo", () => {
    const message =
      "No se recibió el texto del manuscrito para leer. Guarda el capítulo y vuelve a abrir el lector.";
    expect(getReadAloudStartErrorMessage(new Error(message))).toBe(message);
  });

  it("acepta errores nativos serializados y oculta mensajes no reconocidos", () => {
    expect(
      getReadAloudStartErrorMessage({ message: "No se pudo preparar la lectura del manuscrito." }),
    ).toBe("No se pudo preparar la lectura del manuscrito.");
    expect(getReadAloudStartErrorMessage(new Error("información interna"))).toBe(
      "No se pudo iniciar la lectura. Comprueba tu conexión e inténtalo de nuevo.",
    );
  });
});
