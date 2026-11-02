import { describe, expect, it } from "vitest";
import { parseTiptapDocument } from "@escribiendo/book-schema";
import { readAloudBlocksFromDocument } from "./read-aloud-document";

describe("readAloudBlocksFromDocument", () => {
  it("mantiene títulos, párrafos y cursivas/negritas sin HTML inseguro", () => {
    const blocks = readAloudBlocksFromDocument(
      parseTiptapDocument({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Capítulo" }] },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Una " },
              { type: "text", text: "palabra", marks: [{ type: "italic" }, { type: "bold" }] },
              { type: "text", text: " importante." },
            ],
          },
        ],
      }),
    );

    expect(blocks.map((block) => [block.type, block.text])).toEqual([
      ["heading", "Capítulo"],
      ["paragraph", "Una palabra importante."],
    ]);
    expect(blocks[1]?.runs).toContainEqual({ text: "palabra", italic: true, bold: true });
  });

  it("conserva párrafos de citas, listas y separadores editoriales", () => {
    const blocks = readAloudBlocksFromDocument(
      parseTiptapDocument({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Cita." }] }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Elemento" }] }],
              },
            ],
          },
          { type: "sceneBreak" },
        ],
      }),
    );

    expect(blocks.map((block) => [block.type, block.text])).toEqual([
      ["quote", "Cita."],
      ["list-item", "Elemento"],
      ["scene-break", ""],
    ]);
  });

  it("muestra imágenes HTTPS del manuscrito y descarta fuentes inseguras", () => {
    const blocks = readAloudBlocksFromDocument(
      parseTiptapDocument({
        type: "doc",
        content: [
          { type: "image", attrs: { src: "https://cdn.example.org/escena.webp", alt: "La casa" } },
          { type: "image", attrs: { src: "javascript:alert(1)", alt: "No ejecutar" } },
        ],
      }),
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.imageUrl).toBe("https://cdn.example.org/escena.webp");
    expect(blocks[1]?.imageUrl).toBeUndefined();
  });
});
