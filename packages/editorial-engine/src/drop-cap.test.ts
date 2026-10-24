import { describe, expect, it } from "vitest";
import {
  dropCapGrapheme,
  dropCapMetrics,
  extractDropCapGrapheme,
  normalizeDropCapLines,
} from "./drop-cap";
import { textLinePlacement } from "./drawing";
import { paginate, type LayoutBlock, type PageGeometry } from "./pagination";
import { withTypographyDefaults } from "./typography";

const GEOMETRY: PageGeometry = {
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 14,
};

const TYPOGRAPHY = withTypographyDefaults({});

const ESTILO = {
  fontFamily: "serif" as const,
  fontSizePt: 11,
  letterSpacingPt: 0,
  uppercase: false,
  bold: false,
};

describe("selección del grafema inicial", () => {
  it("salta las comillas y los signos de apertura del español", () => {
    expect(dropCapGrapheme("«El silencio de la Auvernia»")).toBe("E");
    expect(dropCapGrapheme("—¡Hola!")).toBe("H");
    expect(dropCapGrapheme("¿Y ahora?")).toBe("Y");
    expect(dropCapGrapheme("“Citado”")).toBe("C");
    expect(dropCapGrapheme("(Paréntesis)")).toBe("P");
  });

  it("toma el grafema completo y no una unidad UTF-16", () => {
    expect(dropCapGrapheme("Ángel")).toBe("Á");
    expect(dropCapGrapheme("🎈Hola")).toBe("🎈");
  });

  it("devuelve null cuando no hay ningún carácter visible", () => {
    expect(dropCapGrapheme("   ")).toBeNull();
    expect(dropCapGrapheme("«»—")).toBeNull();
  });
});

describe("extracción del grafema inicial", () => {
  it("quita solo la letra y conserva comillas, rayas y signos", () => {
    expect(extractDropCapGrapheme([{ text: "«Aquella casa»" }], "A")).toEqual({
      segments: [{ text: "«quella casa»" }],
      removed: true,
    });
    expect(extractDropCapGrapheme([{ text: "—¿Quién llama?" }], "Q")).toEqual({
      segments: [{ text: "—¿uién llama?" }],
      removed: true,
    });
    expect(extractDropCapGrapheme([{ text: "“Había una vez”" }], "H")).toEqual({
      segments: [{ text: "“abía una vez”" }],
      removed: true,
    });
    expect(extractDropCapGrapheme([{ text: "¡Hola!" }], "H")).toEqual({
      segments: [{ text: "¡ola!" }],
      removed: true,
    });
  });

  it("respeta los tramos con formato y las marcas combinadas", () => {
    const segments = [
      { text: "«", marks: { italic: true } },
      { text: "Ángela", marks: { bold: true } },
    ];

    expect(extractDropCapGrapheme(segments, "Á")).toEqual({
      segments: [
        { text: "«", marks: { italic: true } },
        { text: "ngela", marks: { bold: true } },
      ],
      removed: true,
    });

    const combinada = "A\u0301ngela";
    const caracter = dropCapGrapheme(combinada);

    expect(caracter).not.toBeNull();
    expect(extractDropCapGrapheme([{ text: combinada }], caracter!).segments[0]?.text).toBe(
      "ngela",
    );
  });

  it("no toca la línea si el grafema no está", () => {
    expect(extractDropCapGrapheme([{ text: "Hola" }], "Z")).toEqual({
      segments: [{ text: "Hola" }],
      removed: false,
    });
  });
});

describe("geometría de la inicial", () => {
  it("crece con las líneas configuradas y reserva la separación", () => {
    const dos = dropCapMetrics("E", ESTILO, 2);
    const tres = dropCapMetrics("E", ESTILO, 3);

    expect(dos.lines).toBe(2);
    expect(dos.sizePt).toBe(22);
    expect(tres.sizePt).toBe(33);
    expect(dos.advanceMm).toBeGreaterThan(0);
    expect(tres.advanceMm).toBeGreaterThan(dos.advanceMm);
  });

  it("normaliza las líneas admitidas", () => {
    expect(normalizeDropCapLines(undefined)).toBe(3);
    expect(normalizeDropCapLines(2)).toBe(2);
    expect(normalizeDropCapLines(5 as never)).toBe(3);
  });
});

describe("inicial en la paginación", () => {
  function block(overrides: Partial<LayoutBlock> = {}): LayoutBlock {
    return {
      id: "cap",
      kind: "body",
      text: Array.from(
        { length: 6 },
        () => "El silencio empezó en la Auvernia y no terminó nunca más.",
      ).join(" "),
      firstOfSection: true,
      ...overrides,
    };
  }

  it("sangra solo las dos líneas que ocupa una inicial de dos líneas", () => {
    const [page] = paginate(
      [block({ dropCapCharacter: "E", dropCapLines: 2 })],
      GEOMETRY,
      TYPOGRAPHY,
    ).pages;

    const laid = page!.blocks[0]!;
    const leftMm = GEOMETRY.marginOuterMm;

    expect(laid.dropCapLines).toBe(2);
    expect(laid.dropCapSizePt).toBe(22);
    expect(laid.dropCapIndentMm).toBeGreaterThan(0);
    expect(laid.lines.length).toBeGreaterThan(2);

    // Primera línea: solo el hueco de la inicial. Segunda: el mismo hueco.
    // Tercera: ya empieza en el margen.
    const primera = textLinePlacement(laid, 0, 116, leftMm);
    const segunda = textLinePlacement(laid, 1, 116, leftMm);
    const tercera = textLinePlacement(laid, 2, 116, leftMm);

    expect(primera.xMm - leftMm).toBeCloseTo(laid.dropCapIndentMm ?? 0, 5);
    expect(segunda.xMm - leftMm).toBeCloseTo(laid.dropCapIndentMm ?? 0, 5);
    expect(tercera.xMm - leftMm).toBeCloseTo(0, 5);
  });

  it("publica el cuerpo de la inicial para que preview y PDF no lo recalculen", () => {
    const [page] = paginate(
      [block({ dropCapCharacter: "E", dropCapLines: 3 })],
      GEOMETRY,
      TYPOGRAPHY,
    ).pages;

    expect(page!.blocks[0]!.dropCapSizePt).toBe(33);
  });
});
