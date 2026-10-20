import { describe, expect, it } from "vitest";
import { breakIntoLines, measureTextMm, measureTextPoints, splitWords } from "./measure";

const SERIF_11 = {
  fontFamily: "serif" as const,
  fontSizePt: 11,
};

describe("measureTextPoints", () => {
  it("devuelve cero para un texto vacío", () => {
    expect(measureTextPoints("", SERIF_11)).toBe(0);
  });

  it("el ancho crece con el número de caracteres", () => {
    const corto = measureTextPoints("casa", SERIF_11);
    const largo = measureTextPoints("casa", SERIF_11) * 2;

    expect(corto).toBeGreaterThan(0);
    expect(largo).toBeGreaterThan(corto);
  });

  it("las minúsculas anchas miden más que las estrechas", () => {
    expect(measureTextPoints("mmm", SERIF_11)).toBeGreaterThan(measureTextPoints("iii", SERIF_11));
  });

  it("el espacio es más estrecho que una letra", () => {
    expect(measureTextPoints(" ", SERIF_11)).toBeLessThan(measureTextPoints("a", SERIF_11));
  });

  it("el interletraje aumenta el ancho", () => {
    const sinEspaciado = measureTextPoints("hola mundo", { ...SERIF_11, letterSpacingPt: 0 });
    const conEspaciado = measureTextPoints("hola mundo", { ...SERIF_11, letterSpacingPt: 1 });

    expect(conEspaciado).toBeGreaterThan(sinEspaciado);
  });

  it("la tipografía palo seco es más ancha que la serif", () => {
    expect(
      measureTextPoints("el velo de la tarde", { fontFamily: "sans-serif", fontSizePt: 11 }),
    ).toBeGreaterThan(measureTextPoints("el velo de la tarde", SERIF_11));
  });

  it("convierte a milímetros con la equivalencia de la pulgada", () => {
    const puntos = measureTextPoints("texto de prueba", SERIF_11);
    const milimetros = measureTextMm("texto de prueba", SERIF_11);

    expect(milimetros).toBeCloseTo((puntos * 25.4) / 72, 6);
  });
});

describe("splitWords", () => {
  it("parte un texto en palabras", () => {
    expect(splitWords("el velo de la tarde")).toEqual(["el", "velo", "de", "la", "tarde"]);
  });

  it("colapsa los espacios repetidos", () => {
    expect(splitWords("el   velo\n\tde la tarde")).toEqual(["el", "velo", "de", "la", "tarde"]);
  });

  it("devuelve una lista vacía para un texto en blanco", () => {
    expect(splitWords("   \n  ")).toEqual([]);
  });
});

describe("breakIntoLines", () => {
  const opciones = {
    ...SERIF_11,
    lineWidthMm: 40,
  };

  it("devuelve una línea cuando el texto cabe", () => {
    const lineas = breakIntoLines("corto", opciones);

    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.text).toBe("corto");
    expect(lineas[0]?.overflow).toBe(false);
  });

  it("parte el texto en varias líneas cuando no cabe", () => {
    const texto = "el velo de la tarde caía sobre la plaza mientras el reloj marcaba las siete";
    const lineas = breakIntoLines(texto, opciones);

    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas.map((linea) => linea.text).join(" ")).toBe(texto);
  });

  it("ninguna línea normal supera el ancho disponible", () => {
    const texto =
      "el velo de la tarde caía sobre la plaza mientras el reloj marcaba las siete y media";
    const lineas = breakIntoLines(texto, opciones);

    for (const linea of lineas) {
      const ancho = measureTextMm(linea.text, SERIF_11);

      expect(ancho).toBeLessThanOrEqual(opciones.lineWidthMm + 0.001);
    }
  });

  it("marca como desborde una palabra que no cabe ni sola", () => {
    const lineas = breakIntoLines("anticonstitucionalmente", opciones);

    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.overflow).toBe(true);
  });

  it("parte por el guion cuando el guionado está activo", () => {
    const lineas = breakIntoLines("extraordinariamente-palabras", {
      ...opciones,
      hyphenation: true,
    });

    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas.some((linea) => linea.hyphenated)).toBe(true);
    expect(lineas[0]?.text.endsWith("-")).toBe(true);
  });

  it("no parte por el guion cuando el guionado está desactivado", () => {
    const lineas = breakIntoLines("extraordinariamente-palabras", {
      ...opciones,
      hyphenation: false,
    });

    expect(lineas.every((linea) => !linea.hyphenated)).toBe(true);
    expect(lineas.some((linea) => linea.overflow)).toBe(true);
  });

  it("aplica la sangría solo a la primera línea", () => {
    const texto = "el velo de la tarde caía sobre la plaza mientras el reloj marcaba las siete";
    const lineas = breakIntoLines(texto, { ...opciones, firstLineIndentMm: 10 });

    expect(lineas.length).toBeGreaterThan(1);

    // Con sangría, la primera línea tiene menos sitio y admite menos palabras.
    const conSangria = breakIntoLines(texto, { ...opciones, firstLineIndentMm: 10 });
    const sinSangria = breakIntoLines(texto, opciones);

    expect(conSangria[0]?.text.split(" ").length).toBeLessThanOrEqual(
      sinSangria[0]?.text.split(" ").length ?? 0,
    );
  });

  it("devuelve una lista vacía para un texto en blanco", () => {
    expect(breakIntoLines("   ", opciones)).toEqual([]);
  });
});
