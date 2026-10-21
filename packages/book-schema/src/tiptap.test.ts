import { describe, expect, it } from "vitest";
import {
  TiptapValidationError,
  countWords,
  countWordsInDocument,
  emptyTiptapDocument,
  extractPlainText,
  parseTiptapDocument,
  type TiptapDocument,
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

  it("acepta una nota al pie con identificador y texto", () => {
    const document: TiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Una llamada" },
            {
              type: "footnote",
              attrs: { id: "nota-1", note: "Texto de la nota." },
            },
            { type: "text", text: " en el cuerpo." },
          ],
        },
      ],
    };

    expect(parseTiptapDocument(document).type).toBe("doc");
    expect(extractPlainText(document)).toContain("Texto de la nota.");
  });

  it("rechaza una nota al pie sin identificador válido", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "footnote", attrs: { id: "con espacios", note: "Nota" } }],
          },
        ],
      }),
    ).toThrow(TiptapValidationError);
  });

  it("rechaza una nota al pie vacía", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "footnote", attrs: { id: "nota-1", note: "   " } }],
          },
        ],
      }),
    ).toThrow(TiptapValidationError);
  });

  it("rechaza conteúdo anidado dentro de una nota", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "footnote",
                attrs: { id: "nota-1", note: "Nota" },
                content: [{ type: "text", text: "No permitido" }],
              },
            ],
          },
        ],
      }),
    ).toThrow(TiptapValidationError);
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

  it("rechaza un texto con caracteres de control que romperían el EPUB", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Texto con un control\u0007 dentro" }],
          },
        ],
      }),
    ).toThrow(TiptapValidationError);
  });

  it("rechaza una nota al pie con caracteres de control", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "footnote",
                attrs: { id: "nota-1", note: "Nota con un control\u0007 dentro" },
              },
            ],
          },
        ],
      }),
    ).toThrow(TiptapValidationError);
  });

  it("rechaza un enlace con un esquema que ejecuta código", () => {
    expect(() =>
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "clic",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      }),
    ).toThrow(TiptapValidationError);
  });

  it("acepta un enlace normal y uno interno", () => {
    const documento = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "externo",
              marks: [{ type: "link", attrs: { href: "https://ejemplo.test/libro" } }],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "interno",
              marks: [{ type: "link", attrs: { href: "/books/1" } }],
            },
          ],
        },
      ],
    };

    expect(parseTiptapDocument(documento).type).toBe("doc");
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
