import { describe, expect, it } from "vitest";
import { buildEpub, type ExportDocumentModel } from "./epub";
import { buildHtml, buildMarkdown } from "./text-formats";
import { zipEntries } from "./test-utils";

const DOCUMENTO: ExportDocumentModel = {
  title: "Glosario",
  author: "Ana Torres",
  language: "es",
  identifier: "urn:uuid:6f1c2b7a-0000-4000-8000-000000000000",
  glossary: [{ term: "zeugma", definition: "Figura de omisión." }],
  chapters: [
    {
      id: "c1",
      title: "Uno",
      blocks: [
        {
          kind: "body",
          text: "Zeugma",
          runs: [{ text: "Zeugma", glossary: "Zeugma" }],
        },
      ],
    },
  ],
};

describe("marcas de glosario en la exportación", () => {
  it("el HTML envuelve el término y añade la definición como title", () => {
    const html = new TextDecoder().decode(buildHtml(DOCUMENTO));

    expect(html).toContain('class="glossary-term"');
    expect(html).toContain('data-term="Zeugma"');
    expect(html).toContain('title="Figura de omisión."');
    expect(html).toContain(".glossary-term");
  });

  it("el EPUB envuelve el término, añade el title y lo estiliza", () => {
    const epub = zipEntries(buildEpub(DOCUMENTO, new Date("2026-10-26T10:00:00.000Z")));
    const chapter = new TextDecoder().decode(epub.get("EPUB/text/chapter-001.xhtml")!.data);
    const css = new TextDecoder().decode(epub.get("EPUB/style.css")!.data);

    expect(chapter).toContain('class="glossary-term"');
    expect(chapter).toContain('data-term="Zeugma"');
    expect(chapter).toContain('title="Figura de omisión."');
    expect(css).toContain(".glossary-term");
  });

  it("Markdown conserva el texto sin marcado especial", () => {
    const markdown = new TextDecoder().decode(buildMarkdown(DOCUMENTO));

    expect(markdown).toContain("Zeugma");
    expect(markdown).not.toContain("glossary-term");
  });
});
