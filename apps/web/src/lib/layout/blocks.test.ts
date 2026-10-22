import { describe, expect, it } from "vitest";
import {
  bookToBlocks,
  repeatsSectionTitle,
  sectionShowsTitle,
  seccionesExportables,
  sectionToBlocks,
  type PreviewSection,
} from "./blocks";

/** Sección mínima con el contenido indicado. */
function seccion(content: unknown): PreviewSection {
  return {
    id: "s1",
    title: "Prólogo",
    type: "CHAPTER",
    content,
    isChapter: true,
    startOnOddPage: false,
    pageBreakBefore: false,
    includeInExport: true,
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

  it("convierte una nota al pie en una llamada con su texto", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento({
          type: "paragraph",
          content: [
            { type: "text", text: "Una llamada" },
            {
              type: "footnote",
              attrs: { id: "nota-1", note: "Texto de la nota." },
            },
          ],
        }),
      ),
    );

    expect(bloques[0]?.runs?.at(-1)).toEqual({
      text: "1",
      marks: { superscript: true },
      footnote: { id: "nota-1-1", number: 1, note: "Texto de la nota." },
    });
  });

  it("numera las notas de todo el libro en orden de lectura", () => {
    const primera = seccion(
      documento({
        type: "paragraph",
        content: [
          { type: "text", text: "Primera" },
          { type: "footnote", attrs: { id: "nota-1", note: "Uno." } },
        ],
      }),
    );
    const segunda: PreviewSection = {
      ...primera,
      id: "s2",
      title: "Segundo",
      content: documento({
        type: "paragraph",
        content: [
          { type: "text", text: "Segunda" },
          { type: "footnote", attrs: { id: "nota-2", note: "Dos." } },
        ],
      }),
    };

    const notas = bookToBlocks([primera, segunda])
      .flatMap((bloque) => bloque.runs ?? [])
      .flatMap((run) => (run.footnote ? [run.footnote] : []));

    expect(notas.map((nota) => nota.number)).toEqual([1, 2]);
  });

  it("distingue dos llamadas copiadas con el mismo identificador guardado", () => {
    const bloques = sectionToBlocks(
      seccion(
        documento({
          type: "paragraph",
          content: [
            { type: "text", text: "Primera" },
            { type: "footnote", attrs: { id: "repetida", note: "Uno." } },
            { type: "text", text: " segunda" },
            { type: "footnote", attrs: { id: "repetida", note: "Dos." } },
          ],
        }),
      ),
    );
    const notas = (bloques[0]?.runs ?? []).flatMap((run) => (run.footnote ? [run.footnote] : []));

    expect(notas.map((nota) => nota.number)).toEqual([1, 2]);
    expect(new Set(notas.map((nota) => nota.id)).size).toBe(2);
    expect(notas.map((nota) => nota.note)).toEqual(["Uno.", "Dos."]);
  });

  it("no inventa bloques con contenido inválido", () => {
    expect(sectionToBlocks(seccion({ type: "doc", content: "no es un arreglo" }))).toEqual([]);
  });
});

describe("bookToBlocks", () => {
  it("antepone el título y deja sin sangría el primer párrafo", () => {
    const section: PreviewSection = {
      ...seccion(documento({ type: "paragraph", content: [{ type: "text", text: "Texto." }] })),
      startOnOddPage: true,
    };
    const blocks = bookToBlocks([section]);

    expect(blocks.map((block) => block.kind)).toEqual(["chapterTitle", "body"]);
    expect(blocks[0]?.startsChapter).toBe(true);
    expect(blocks[0]?.breaksBefore).toBe(false);
    expect(blocks[1]?.startsChapter).toBe(false);
    expect(blocks[1]?.firstOfSection).toBe(true);
  });

  it("marca solo la inicial del primer párrafo de un capítulo cuando se activa", () => {
    const section: PreviewSection = {
      ...seccion(
        documento({ type: "paragraph", content: [{ type: "text", text: "Una entrada." }] }),
      ),
      startOnOddPage: true,
    };
    const bloques = bookToBlocks([section], { dropCaps: true });
    const cuerpo = bloques.find((bloque) => bloque.kind === "body");

    expect(cuerpo?.dropCapCharacter).toBe("U");
    expect(bookToBlocks([section])[1]?.dropCapCharacter).toBeUndefined();
  });

  it("quita un título de contenido repetido sin distinguir espacios ni mayúsculas", () => {
    const section = seccion(
      documento(
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "PRÓLOGO" }] },
        { type: "paragraph", content: [{ type: "text", text: "Texto." }] },
      ),
    );
    const blocks = bookToBlocks([section]);

    expect(blocks.map((block) => block.kind)).toEqual(["chapterTitle", "body"]);
    expect(repeatsSectionTitle(blocks.slice(1), " pró logo ")).toBe(false);
    expect(repeatsSectionTitle([{ text: " Pró\nlogo " }], "Prólogo")).toBe(true);
  });

  it("usa heading2 para subcapítulos y no añade títulos a secciones preliminares", () => {
    const subchapter = { ...seccion(documento()), type: "SUBCHAPTER", title: "Una pausa" };
    const dedication = { ...seccion(documento()), type: "DEDICATION", title: "A mi madre" };

    expect(bookToBlocks([subchapter])[0]?.kind).toBe("heading2");
    expect(bookToBlocks([dedication])).toEqual([]);
    expect(sectionShowsTitle("ABOUT_AUTHOR", " Sobre el autor ")).toBe(true);
    expect(sectionShowsTitle("COPYRIGHT", "Derechos")).toBe(false);
  });

  it("marca el salto de página propio de la sección", () => {
    const conSalto: PreviewSection = {
      ...seccion(documento({ type: "paragraph", content: [{ type: "text", text: "Texto." }] })),
      pageBreakBefore: true,
    };

    const bloques = bookToBlocks([conSalto]);

    expect(bloques[0]?.breaksBefore).toBe(true);
  });

  it("no marca salto de página cuando la sección no lo pide", () => {
    const bloques = bookToBlocks([
      seccion(documento({ type: "paragraph", content: [{ type: "text", text: "Texto." }] })),
    ]);

    expect(bloques[0]?.breaksBefore).toBe(false);
  });
});

describe("seccionesExportables", () => {
  it("deja fuera la sección que no se quiere exportar", () => {
    const incluida = seccion(
      documento({ type: "paragraph", content: [{ type: "text", text: "Sí." }] }),
    );
    const excluida: PreviewSection = {
      ...incluida,
      id: "s2",
      includeInExport: false,
    };

    const exportables = seccionesExportables([incluida, excluida]);

    expect(exportables.map((section) => section.id)).toEqual(["s1"]);
  });

  it("una sección sin el dato se exporta", () => {
    const exportables = seccionesExportables([
      { id: "s1", title: "Sección", type: "CHAPTER", content: null, isChapter: true },
    ]);

    expect(exportables).toHaveLength(1);
  });
});
