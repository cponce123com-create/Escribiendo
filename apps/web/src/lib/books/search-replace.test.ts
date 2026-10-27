import { describe, expect, it } from "vitest";
import type { TiptapDocument } from "@escribiendo/book-schema";
import { buildSearchPattern, replaceDocument, searchDocument } from "./search-replace";

function doc(...paragraphs: string[]): TiptapDocument {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function pattern(options: Parameters<typeof buildSearchPattern>[0]): RegExp {
  const result = buildSearchPattern(options);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.pattern;
}

describe("buildSearchPattern", () => {
  it("rechaza una búsqueda vacía o demasiado larga", () => {
    expect(buildSearchPattern({ query: "  " })).toEqual({
      ok: false,
      error: "Escribe el texto que quieres buscar.",
    });
    expect(buildSearchPattern({ query: "a".repeat(201) }).ok).toBe(false);
  });

  it("rechaza expresiones regulares para evitar bloqueo del servidor", () => {
    expect(buildSearchPattern({ query: "(", regex: true })).toEqual({
      ok: false,
      error: "Las expresiones regulares no están disponibles. Usa una búsqueda literal.",
    });
  });

  it("rechaza patrones de retroceso catastrófico sin evaluarlos", () => {
    const start = performance.now();
    expect(buildSearchPattern({ query: "(a+)+b", regex: true }).ok).toBe(false);
    const literal = pattern({ query: "(a+)+b" });
    expect(searchDocument(doc("a".repeat(40) + "c"), literal).count).toBe(0);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("escapa los caracteres especiales en modo literal", () => {
    const literal = pattern({ query: "A.B" });

    expect(literal.test("A.B")).toBe(true);
    expect(literal.test("AXB")).toBe(false);
  });
});

describe("searchDocument", () => {
  it("cuenta coincidencias y recoge extractos con contexto", () => {
    const result = searchDocument(
      doc("Marta cerró la puerta. Marta salió.", "Otra sección sin el nombre."),
      pattern({ query: "marta" }),
    );

    expect(result.count).toBe(2);
    expect(result.excerpts).toHaveLength(2);
    expect(result.excerpts[0]?.match).toBe("Marta");
    expect(result.excerpts[0]?.after).toContain("cerró la puerta");
    expect(result.truncated).toBe(false);
  });

  it("respeta mayúsculas cuando se pide", () => {
    const result = searchDocument(
      doc("Marta y marta"),
      pattern({ query: "Marta", caseSensitive: true }),
    );

    expect(result.count).toBe(1);
  });

  it("con palabra completa no coincide dentro de otra palabra", () => {
    const result = searchDocument(
      doc("Anabel llegó con Ana."),
      pattern({ query: "Ana", wholeWord: true }),
    );

    expect(result.count).toBe(1);
    expect(result.excerpts[0]?.match).toBe("Ana");
  });

  it("limita el número de coincidencias", () => {
    const result = searchDocument(doc("eco eco eco eco"), pattern({ query: "eco" }), {
      maxMatches: 2,
    });

    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
  });
});

describe("replaceDocument", () => {
  it("reemplaza solo el texto y conserva marcas y estructura", () => {
    const original: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Marta ", marks: [{ type: "bold" }] },
            { type: "text", text: "cerró la puerta." },
          ],
        },
      ],
    };

    const result = replaceDocument(original, pattern({ query: "Marta" }), "Elena", {
      literal: true,
    });
    const first = result.document.content[0]?.content?.[0];

    expect(result.replacements).toBe(1);
    expect(first?.text).toBe("Elena ");
    expect(first?.marks).toEqual([{ type: "bold" }]);
    expect(result.document.content[0]?.content?.[1]?.text).toBe("cerró la puerta.");
  });

  it("no toca atributos como las notas al pie", () => {
    const original: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Texto" },
            { type: "footnote", attrs: { id: "n1", note: "Marta" } },
          ],
        },
      ],
    };

    const result = replaceDocument(original, pattern({ query: "Marta" }), "Elena", {
      literal: true,
    });

    expect(result.replacements).toBe(0);
    expect(result.document).toEqual(original);
  });

  it("en modo literal el reemplazo no interpreta $1", () => {
    const result = replaceDocument(doc("Marta"), pattern({ query: "Marta" }), "$1", {
      literal: true,
    });

    expect(result.document.content[0]?.content?.[0]?.text).toBe("$1");
  });

  it("permite borrar el texto encontrado", () => {
    const result = replaceDocument(doc("Hola mundo"), pattern({ query: " mundo" }), "", {
      literal: true,
    });

    expect(result.document.content[0]?.content?.[0]?.text).toBe("Hola");
  });
});
