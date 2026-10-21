import { describe, expect, it } from "vitest";
import { sectionToBlocks, type PreviewSection } from "./blocks";

/** Sección mínima con el contenido indicado. */
function seccion(content: unknown): PreviewSection {
  return {
    id: "s1",
    title: "Prólogo",
    type: "CHAPTER",
    content,
    isChapter: true,
    startOnOddPage: false,
  };
}

function documento(...nodes: unknown[]): unknown {
  return { type: "doc", content: nodes };
}

describe("sectionToBlocks", () => {
  it("conserva la negrita y la cursiva en tramos separados", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento({
          type: "paragraph",
          content: [
            { type: "text", text: "La " },
            { type: "text", text: "noche", marks: [{ type: "bold" }] },
            { type: "text", text: " era " },
            { type: "text", text: "oscura", marks: [{ type: "italic" }] },
            { type: "text", text: "." },
          ],
        }),
      ),
    );

    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.text).toBe("La noche era oscura.");
    expect(bloques[0]?.runs).toEqual([
      { text: "La " },
      { text: "noche", marks: { bold: true } },
      { text: " era " },
      { text: "oscura", marks: { italic: true } },
      { text: "." },
    ]);
  });

  it("conserva subrayado, tachado, superíndice y enlace", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento({
          type: "paragraph",
          content: [
            { type: "text", text: "nota" },
            { type: "text", text: "2", marks: [{ type: "superscript" }] },
            { type: "text", text: " " },
            { type: "text", text: "tachado", marks: [{ type: "strike" }] },
            { type: "text", text: " " },
            { type: "text", text: "subrayado", marks: [{ type: "underline" }] },
            { type: "text", text: " " },
            {
              type: "text",
              text: "enlace",
              marks: [{ type: "link", attrs: { href: "https://ejemplo.test" } }],
            },
          ],
        }),
      ),
    );

    const runs = bloques[0]?.runs ?? [];

    expect(runs.find((run) => run.text === "2")?.marks?.superscript).toBe(true);
    expect(runs.find((run) => run.text === "tachado")?.marks?.strike).toBe(true);
    expect(runs.find((run) => run.text === "subrayado")?.marks?.underline).toBe(true);
    expect(runs.find((run) => run.text === "enlace")?.marks?.link).toBe("https://ejemplo.test");
  });

  it("convierte el separador de escena en una regla, no en un salto de página", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento(
          { type: "paragraph", content: [{ type: "text", text: "Antes." }] },
          { type: "horizontalRule" },
          { type: "paragraph", content: [{ type: "text", text: "Después." }] },
        ),
      ),
    );

    expect(bloques.map((bloque) => bloque.kind)).toEqual(["body", "rule", "body"]);
    expect(bloques[1]?.text).toBe("");
  });

  it("conserva la imagen, su pie y sus proporciones", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento({
          type: "image",
          attrs: {
            src: "https://ejemplo.test/plaza.jpg",
            alt: "La plaza al anochecer",
            caption: "La plaza, desde el balcón.",
            widthPx: 1200,
            heightPx: 800,
            widthPercent: 75,
            alignment: "right",
          },
        }),
      ),
    );

    expect(bloques[0]?.kind).toBe("image");
    expect(bloques[0]?.image).toEqual({
      src: "https://ejemplo.test/plaza.jpg",
      alt: "La plaza al anochecer",
      caption: "La plaza, desde el balcón.",
      widthPx: 1200,
      heightPx: 800,
      widthPercent: 75,
      alignment: "right",
    });
  });

  it("numera los elementos de una lista ordenada", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento({
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Uno" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Dos" }] }],
            },
          ],
        }),
      ),
    );

    expect(bloques[0]?.kind).toBe("list");
    expect(bloques[0]?.text).toBe("1. Uno\n2. Dos");
    expect(bloques[0]?.runs?.[0]).toEqual({ text: "1. " });
  });

  it("no inventa bloques con contenido inválido", () => {
    expect(sectionToBlocks(seccion({ type: "doc", content: "no es un arreglo" }))).toEqual([]);
  });
});
