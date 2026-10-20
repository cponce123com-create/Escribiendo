import { describe, expect, it } from "vitest";
import {
  TiptapValidationError,
  countWords,
  countWordsInDocument,
  emptyTiptapDocument,
  extractPlainText,
  parseTiptapDocument,
} from "./tiptap";

const documentWithParagraphs = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "El comienzo" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Había una vez " },
        { type: "text", text: "una editorial", marks: [{ type: "italic" }] },
        { type: "text", text: " sin prisa." },
      ],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Y un manuscrito interminable." }],
    },
  ],
};

describe("parseTiptapDocument", () => {
  it("acepta un documento válido", () => {
    expect(parseTiptapDocument(emptyTiptapDocument).type).toBe("doc");
  });

  it("rechaza un nodo raíz incorrecto", () => {
    expect(() => parseTiptapDocument({ type: "paragraph", content: [] })).toThrow(
      TiptapValidationError,
    );
  });

  it("rechaza un nodo de texto sin text", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text" }] }],
      }),
    ).toThrow(TiptapValidationError);
  });
});

describe("extractPlainText", () => {
  it("extrae el texto sin perder acentos", () => {
    const text = extractPlainText(parseTiptapDocument(documentWithParagraphs));
    expect(text).toContain("El comienzo");
    expect(text).toContain("una editorial sin prisa.");
  });

  it("une texto contiguo con distintas marcas sin inventar espacios", () => {
    const text = extractPlainText(parseTiptapDocument(documentWithParagraphs));
    expect(text).toContain("Había una vez una editorial sin prisa.");
  });
});

describe("word count", () => {
  it("cuenta palabras en español y palabras con guion", () => {
    expect(countWords("Un fuera-de-lugar, dos veces.")).toBe(4);
  });

  it("cuenta las palabras de un documento", () => {
    expect(countWordsInDocument(parseTiptapDocument(documentWithParagraphs))).toBe(13);
  });
});
