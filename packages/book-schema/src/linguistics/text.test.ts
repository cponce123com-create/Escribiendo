import { describe, expect, it } from "vitest";
import { parseTiptapDocument } from "../tiptap";
import {
  countSpanishWords,
  extractTiptapTextBlocks,
  normalizeSpanishForComparison,
  normalizeSpanishText,
  splitSpanishSentences,
  tokenizeSpanishText,
} from "./text";

describe("normalización y tokenización en español", () => {
  it("normaliza equivalencias Unicode sin quitar las tildes", () => {
    expect(normalizeSpanishText("Cafe\u0301")).toBe("Café");
    expect(normalizeSpanishForComparison("CAFE\u0301")).toBe("café");
    expect(normalizeSpanishForComparison("si")).not.toBe(normalizeSpanishForComparison("sí"));
  });

  it("tokeniza marcas combinantes y decimales, conservando offsets del original", () => {
    const source = "Cafe\u0301 12,5 fuera-de-lugar";
    const tokens = tokenizeSpanishText(source);
    expect(tokens.map((token) => token.normalized)).toEqual(["café", "12,5", "fuera-de-lugar"]);
    expect(source.slice(tokens[0]?.startOffset, tokens[0]?.endOffset)).toBe("Cafe\u0301");
    expect(tokens[1]?.text).toBe("12,5");
  });

  it("usa el mismo contrato de tokens para el conteo compartido", () => {
    expect(countSpanishWords("Cafe\u0301 noir, 12,5 fuera-de-lugar.")).toBe(4);
  });
});

describe("segmentación española", () => {
  it("respeta abreviaturas, decimales, signos de apertura y citas de diálogo", () => {
    const text = "El Dr. López llegó. El valor es 3,14. Dijo: «¡Vamos!» —respondió.";
    expect(splitSpanishSentences(text).map((sentence) => sentence.text)).toEqual([
      "El Dr. López llegó.",
      "El valor es 3,14.",
      "Dijo: «¡Vamos!» —respondió.",
    ]);
  });

  it("trata etc. como abreviatura antes de minúscula y fin de oración antes de mayúscula", () => {
    expect(
      splitSpanishSentences("Trajo pan, etc. y agua. Luego se fue.").map((item) => item.text),
    ).toEqual(["Trajo pan, etc. y agua.", "Luego se fue."]);
  });
});

describe("posiciones de bloques Tiptap", () => {
  it("mapea encabezados, marcas y caracteres astrales a offsets ProseMirror UTF-16", () => {
    const document = parseTiptapDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "A😀", marks: [{ type: "bold" }] },
            { type: "text", text: "." },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Capítulo" }],
        },
      ],
    });

    expect(extractTiptapTextBlocks(document)).toEqual([
      {
        type: "paragraph",
        paragraphIndex: 0,
        text: "A😀.",
        startOffset: 1,
        endOffset: 5,
        isDialogue: false,
      },
      {
        type: "heading",
        headingLevel: 2,
        paragraphIndex: 1,
        text: "Capítulo",
        startOffset: 7,
        endOffset: 15,
        isDialogue: false,
      },
    ]);
  });

  it("no crea un rango anclable sobre el contenido interno de una nota al pie", () => {
    const document = parseTiptapDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "uno" },
            { type: "footnote", attrs: { id: "n1", note: "nota" } },
            { type: "text", text: "dos" },
          ],
        },
      ],
    });

    expect(
      extractTiptapTextBlocks(document).map(({ text, startOffset, endOffset }) => ({
        text,
        startOffset,
        endOffset,
      })),
    ).toEqual([
      { text: "uno", startOffset: 1, endOffset: 4 },
      { text: "dos", startOffset: 5, endOffset: 8 },
    ]);
  });

  it("conserva el tamaño estructural de los bloques vacíos al calcular posiciones siguientes", () => {
    const document = parseTiptapDocument({
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "después" }] },
      ],
    });

    expect(
      extractTiptapTextBlocks(document).map(({ text, startOffset, endOffset }) => ({
        text,
        startOffset,
        endOffset,
      })),
    ).toEqual([
      { text: "", startOffset: 1, endOffset: 1 },
      { text: "después", startOffset: 3, endOffset: 10 },
    ]);
  });

  it("marca los párrafos que empiezan con raya de diálogo", () => {
    const document = parseTiptapDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "—¿Vienes?" }] }],
    });
    expect(extractTiptapTextBlocks(document)[0]?.isDialogue).toBe(true);
  });
});
