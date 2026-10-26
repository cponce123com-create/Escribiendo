import { escapeMarkdownText } from "@escribiendo/export-engine";
import { describe, expect, it } from "vitest";
import { buildStoryBibleMarkdown, type StoryBibleInput } from "./bible-markdown";

const NEWLINE = String.fromCharCode(10);

const emptyBook: StoryBibleInput = {
  bookTitle: "El velo de la tarde",
  characters: [],
  worlds: [],
  planItems: [],
  relations: [],
  missing: [],
};

describe("buildStoryBibleMarkdown", () => {
  it("incluye las cinco secciones aunque el libro esté vacío", () => {
    const markdown = buildStoryBibleMarkdown(emptyBook);

    expect(markdown).toContain("# Biblia de la historia — El velo de la tarde");
    expect(markdown).toContain("## Personajes");
    expect(markdown).toContain("## Mundos y objetos");
    expect(markdown).toContain("## Trama");
    expect(markdown).toContain("## Relaciones");
    expect(markdown).toContain("## Sin menciones");
  });

  it("termina en un único salto de línea y no deja huecos triples", () => {
    const markdown = buildStoryBibleMarkdown(emptyBook);

    expect(markdown.endsWith(NEWLINE)).toBe(true);
    expect(markdown.endsWith(NEWLINE.repeat(2))).toBe(false);
    expect(markdown).not.toContain(NEWLINE.repeat(3));
  });

  it("escapa los caracteres que Markdown interpretaría como estructura", () => {
    const markdown = buildStoryBibleMarkdown({
      ...emptyBook,
      characters: [
        {
          name: "Ana *la* [roja]",
          aliases: ["Ana_2"],
          labelTitle: "Papel",
          label: "Protagonista",
          summary: "Una mujer con <prisa>",
        },
      ],
    });

    expect(markdown).toContain(escapeMarkdownText("Ana *la* [roja]"));
    expect(markdown).toContain(escapeMarkdownText("Ana_2"));
    expect(markdown).toContain(escapeMarkdownText("Una mujer con <prisa>"));
  });

  it("ordena personajes y mundos por nombre, sin depender del orden de entrada", () => {
    const markdown = buildStoryBibleMarkdown({
      ...emptyBook,
      characters: [
        {
          name: "Bruno",
          aliases: [],
          labelTitle: "Papel",
          label: "Secundario",
          summary: null,
        },
        {
          name: "Ana",
          aliases: [],
          labelTitle: "Papel",
          label: "Protagonista",
          summary: null,
        },
      ],
    });

    expect(markdown.indexOf("### Ana")).toBeLessThan(markdown.indexOf("### Bruno"));
  });

  it("lista los vínculos una sola vez y con su etiqueta", () => {
    const markdown = buildStoryBibleMarkdown({
      ...emptyBook,
      relations: [
        { from: "Ana", to: "Bruno", label: "Rivalidad", description: "Se odian desde el puerto." },
      ],
    });

    expect(markdown).toContain("- **Ana** — **Bruno**: Rivalidad. Se odian desde el puerto.");
    expect(markdown.split("**Ana**").length - 1).toBe(1);
  });

  it("menciona las fichas que no aparecen en el manuscrito", () => {
    const markdown = buildStoryBibleMarkdown({ ...emptyBook, missing: ["El faro", "La ciudad"] });

    expect(markdown).toContain("- El faro");
    expect(markdown).toContain("- La ciudad");
  });

  it("avisa cuando todas las fichas aparecen", () => {
    const markdown = buildStoryBibleMarkdown(emptyBook);

    expect(markdown).toContain("Todas las fichas aparecen al menos una vez");
  });
});
