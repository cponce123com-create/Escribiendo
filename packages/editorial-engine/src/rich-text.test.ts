import { describe, expect, it } from "vitest";
import { breakIntoLines, measureTextMm } from "./measure";
import { breakRunsIntoLines, hasInlineMarks, runsToText, type InlineRun } from "./rich-text";

const SERIF_11 = {
  fontFamily: "serif" as const,
  fontSizePt: 11,
  lineWidthMm: 60,
};

describe("hasInlineMarks", () => {
  it("no detecta formato en un texto plano", () => {
    expect(hasInlineMarks([{ text: "Un párrafo sin nada." }])).toBe(false);
  });

  it("detecta la negrita", () => {
    expect(hasInlineMarks([{ text: "Muy ", marks: { bold: true } }, { text: "serio" }])).toBe(true);
  });

  it("detecta un enlace", () => {
    expect(hasInlineMarks([{ text: "aquí", marks: { link: "https://ejemplo.test" } }])).toBe(true);
  });

  it("no considera formato un objeto de marcas vacío", () => {
    expect(hasInlineMarks([{ text: "plano", marks: {} }])).toBe(false);
  });
});

describe("runsToText", () => {
  it("une los tramos en orden", () => {
    expect(
      runsToText([{ text: "La " }, { text: "noche", marks: { italic: true } }, { text: "." }]),
    ).toBe("La noche.");
  });
});

describe("breakRunsIntoLines", () => {
  it("sin marcas produce las mismas líneas que el reparto plano", () => {
    const texto =
      "En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo.";

    const plano = breakIntoLines(texto, SERIF_11);
    const rico = breakRunsIntoLines([{ text: texto }], SERIF_11);

    expect(rico.map((line) => line.text)).toEqual(plano.map((line) => line.text));
    expect(rico.every((line) => line.segments.length === 1)).toBe(true);
  });

  it("conserva la negrita en todas las líneas en que se parte", () => {
    const runs: InlineRun[] = [
      {
        text: "Una frase muy larga que no cabe en una sola línea y sigue creciendo ".repeat(3),
        marks: { bold: true },
      },
    ];

    const lineas = breakRunsIntoLines(runs, { ...SERIF_11, lineWidthMm: 45 });

    expect(lineas.length).toBeGreaterThan(1);
    expect(
      lineas.every((line) =>
        line.segments
          .filter((segment) => segment.text.trim().length > 0)
          .every((segment) => segment.marks?.bold === true),
      ),
    ).toBe(true);
    expect(lineas.map((line) => line.text).join(" ")).toContain("Una frase muy larga");
  });

  it("separa los tramos con su formato dentro de la línea", () => {
    const lineas = breakRunsIntoLines(
      [
        { text: "La " },
        { text: "noche", marks: { bold: true } },
        { text: " era " },
        { text: "oscura", marks: { italic: true } },
        { text: "." },
      ],
      SERIF_11,
    );

    expect(lineas).toHaveLength(1);

    const negrita = lineas[0]?.segments.find((segment) => segment.text === "noche");
    const cursiva = lineas[0]?.segments.find((segment) => segment.text === "oscura");

    expect(negrita?.marks?.bold).toBe(true);
    expect(cursiva?.marks?.italic).toBe(true);
  });

  it("la negrita ocupa más y puede adelantar el salto de línea", () => {
    const texto = "palabra palabra palabra palabra";
    const plano = breakRunsIntoLines([{ text: texto }], SERIF_11);
    const negrita = breakRunsIntoLines([{ text: texto, marks: { bold: true } }], SERIF_11);

    expect(measureTextMm(texto, { ...SERIF_11, bold: true })).toBeGreaterThan(
      measureTextMm(texto, SERIF_11),
    );
    expect(negrita.length).toBeGreaterThanOrEqual(plano.length);
  });

  it("pide al medidor real la cara que corresponde a cada tramo", () => {
    const estilos: Array<{ bold: boolean; italic: boolean }> = [];
    const runs: InlineRun[] = [
      { text: "redonda " },
      { text: "negrita", marks: { bold: true } },
      { text: " cursiva", marks: { italic: true } },
    ];

    breakRunsIntoLines(runs, {
      ...SERIF_11,
      measure: (text, options) => {
        estilos.push({ bold: options.bold === true, italic: options.italic === true });

        return text.length * 10;
      },
    });

    expect(estilos.some((estilo) => estilo.bold && !estilo.italic)).toBe(true);
    expect(estilos.some((estilo) => estilo.italic && !estilo.bold)).toBe(true);
  });

  it("parte por un guion existente y conserva el formato del fragmento", () => {
    const runs: InlineRun[] = [{ text: "extraordinariamente-larguísimo", marks: { italic: true } }];

    const lineas = breakRunsIntoLines(runs, { ...SERIF_11, lineWidthMm: 45, hyphenation: true });

    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas[0]?.hyphenated).toBe(true);
    expect(lineas[0]?.text.endsWith("-")).toBe(true);
    expect(lineas[0]?.segments.every((segment) => segment.marks?.italic === true)).toBe(true);
  });

  it("respeta el sangrado de la primera línea", () => {
    const texto = "palabra ".repeat(20);
    const sinSangria = breakRunsIntoLines([{ text: texto, marks: { bold: true } }], SERIF_11);
    const conSangria = breakRunsIntoLines([{ text: texto, marks: { bold: true } }], {
      ...SERIF_11,
      firstLineIndentMm: 15,
    });

    expect(conSangria[0]?.text.length).toBeLessThan(sinSangria[0]?.text.length ?? 0);
  });

  it("no pierde palabras al repartir", () => {
    const texto =
      "El velo de la tarde caía sobre los tejados y la plaza se quedaba sin voces, sin pasos y sin sombras.";
    const lineas = breakRunsIntoLines([{ text: texto, marks: { bold: true } }], {
      ...SERIF_11,
      lineWidthMm: 40,
    });

    expect(lineas.map((line) => line.text).join(" ")).toBe(texto);
  });

  it("devuelve una lista vacía si no hay texto", () => {
    expect(breakRunsIntoLines([], SERIF_11)).toEqual([]);
    expect(breakRunsIntoLines([{ text: "" }], SERIF_11)).toEqual([]);
  });
});

it("compacta los tramos equivalentes después de repartir líneas y conserva el texto", () => {
  const text = "Inicio " + "palabra ".repeat(1000).trimEnd();
  const lines = breakRunsIntoLines(
    [
      { text: "Inicio", marks: { bold: true } },
      { text: text.slice(6), marks: { bold: false, italic: false } },
    ],
    SERIF_11,
  );
  expect(lines.map((line) => line.text).join(" ")).toBe(text);
  expect(lines.reduce((sum, line) => sum + line.segments.length, 0)).toBeLessThanOrEqual(
    lines.length + 2,
  );
});

it("mantiene llamadas de nota y límites de enlaces, glosario y decoración", () => {
  const note = { id: "nota-compacta", number: 1, note: "Texto de nota" };
  const lines = breakRunsIntoLines(
    [
      { text: "Uno", marks: { link: "https://example.org/uno" } },
      { text: "dos", marks: { link: "https://example.org/dos" } },
      { text: "tres", marks: { glossary: "tres", underline: true } },
      { text: "1", marks: { superscript: true }, footnote: note },
      { text: " final" },
    ],
    { ...SERIF_11, lineWidthMm: 100 },
  );
  const segments = lines.flatMap((line) => line.segments);
  expect(segments.find((segment) => segment.footnote)?.text).toBe("1");
  expect(segments.find((segment) => segment.footnote)?.footnote).toEqual(note);
  expect(
    segments.filter((segment) => segment.marks?.link).map((segment) => segment.marks?.link),
  ).toEqual(["https://example.org/uno", "https://example.org/dos"]);
  expect(segments.find((segment) => segment.marks?.glossary)?.marks?.underline).toBe(true);
});
