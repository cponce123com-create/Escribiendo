import { describe, expect, it } from "vitest";
import type { ExportDocumentModel } from "./epub";
import { buildHtml, buildMarkdown, buildPlainText } from "./text-formats";

const NL = "\n";

const DOCUMENTO: ExportDocumentModel = {
  title: "El velo de la tarde",
  author: "Ana Torres",
  language: "es",
  identifier: "urn:uuid:6f1c2b7a-0000-4000-8000-000000000000",
  chapters: [
    {
      id: "c1",
      title: "El velo de la tarde",
      showTitle: false,
      blocks: [
        { kind: "title", text: "El velo de la tarde" },
        {
          kind: "body",
          text: "Caía la tarde sobre la plaza.",
          runs: [
            { text: "Caía la " },
            { text: "tarde", bold: true },
            { text: " sobre la " },
            { text: "plaza", italic: true },
            { text: "." },
          ],
        },
        { kind: "heading", text: "Un aparte", level: 2 },
        { kind: "quote", text: "El tiempo no pasa: se queda." },
        { kind: "rule", text: "" },
        {
          kind: "body",
          text: "Una nota.",
          runs: [
            { text: "Una nota" },
            { text: "", footnote: { id: "fn1", number: 1, note: "Nota al pie" } },
          ],
        },
      ],
    },
    {
      id: "c2",
      title: "Marta",
      blocks: [
        { kind: "body", text: "Marta cerró la puerta de la librería." },
        { kind: "pageBreak", text: "" },
        {
          kind: "image",
          text: "",
          image: { src: "https://example.test/marta.png", alt: "Marta en la puerta" },
        },
      ],
    },
  ],
};

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("buildMarkdown", () => {
  const markdown = decode(buildMarkdown(DOCUMENTO));

  it("incluye título, autor e índice", () => {
    expect(markdown).toContain("# El velo de la tarde");
    expect(markdown).toContain("*Ana Torres*");
    expect(markdown).toContain("## Índice");
    expect(markdown).toContain("- Marta");
  });

  it("respeta la jerarquía y el formato en línea", () => {
    expect(markdown).toContain("## Marta");
    expect(markdown).toContain("**tarde**");
    expect(markdown).toContain("*plaza*");
    expect(markdown).toContain("### Un aparte");
  });

  it("convierte citas, separadores, imágenes y notas al pie", () => {
    expect(markdown).toContain("> El tiempo no pasa: se queda.");
    expect(markdown).toContain("* * *");
    expect(markdown).toContain("![Marta en la puerta](https://example.test/marta.png)");
    expect(markdown).toContain("[^1]");
    expect(markdown).toContain("[^1]: Nota al pie");
  });

  it("escapa el marcado del manuscrito", () => {
    const escaped = decode(
      buildMarkdown({
        ...DOCUMENTO,
        chapters: [
          {
            id: "x",
            title: "Asteriscos",
            blocks: [{ kind: "body", text: "Un *dato* y un [enlace]" }],
          },
        ],
      }),
    );

    expect(escaped).toContain("Un \*dato\*");
    expect(escaped).toContain("\[enlace\]");
  });

  it("termina con un salto de línea y no duplica líneas vacías", () => {
    expect(markdown.endsWith(NL)).toBe(true);
    expect(markdown).not.toContain(`${NL}${NL}${NL}`);
  });
});

describe("buildHtml", () => {
  const html = decode(buildHtml(DOCUMENTO));

  it("genera un documento HTML5 autónomo con el idioma", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("</html>");
  });

  it("marca los tramos con etiquetas semánticas", () => {
    expect(html).toContain("<strong>tarde</strong>");
    expect(html).toContain("<em>plaza</em>");
    expect(html).toContain("<blockquote>El tiempo no pasa: se queda.</blockquote>");
    expect(html).toContain('<hr class="scene" />');
    expect(html).toContain('<figure class="image">');
  });

  it("resuelve las notas al pie con enlaces internos", () => {
    expect(html).toContain('href="#fn-fn1"');
    expect(html).toContain('<li id="fn-fn1">Nota al pie');
  });

  it("escapa el texto del manuscrito", () => {
    const escaped = decode(
      buildHtml({
        ...DOCUMENTO,
        chapters: [
          {
            id: "x",
            title: "Riesgo",
            blocks: [{ kind: "body", text: '<script>alert("x")</script> & más' }],
          },
        ],
      }),
    );

    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&amp; más");
  });
});

describe("buildPlainText", () => {
  const text = decode(buildPlainText(DOCUMENTO));

  it("conserva el contenido sin marcado", () => {
    expect(text).toContain("El velo de la tarde");
    expect(text).toContain("Ana Torres");
    expect(text).toContain("Marta cerró la puerta de la librería.");
    expect(text).not.toContain("**tarde**");
    expect(text).not.toContain("<em>");
  });

  it("subraya los títulos de capítulo y separa escenas", () => {
    expect(text).toContain("Marta");
    expect(text).toContain("=====");
    expect(text).toContain("* * *");
  });

  it("sangra las citas y describe las imágenes sin origen", () => {
    expect(text).toContain("    El tiempo no pasa: se queda.");
    expect(text).toContain("[Imagen: Marta en la puerta]");
  });

  it("numera las notas al pie", () => {
    expect(text).toContain("[1] Nota al pie");
  });
});
