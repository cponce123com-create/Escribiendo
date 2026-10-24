import { describe, expect, it } from "vitest";
import { buildDocx } from "./docx";
import type { ExportDocumentModel } from "./epub";
import { zipEntries, type ZipEntryLeida } from "./test-utils";

const FECHA = new Date("2026-10-24T10:00:00.000Z");

const DOCUMENTO: ExportDocumentModel = {
  title: "El silencio de la Auvernia",
  author: "Carlos Ponce",
  language: "es",
  identifier: "urn:uuid:6f1c2b7a-0000-4000-8000-000000000002",
  chapters: [
    {
      id: "matter-toc",
      title: "Índice",
      showTitle: false,
      blocks: [
        {
          kind: "body",
          text: "Capítulo primero",
          toc: { title: "Capítulo primero", label: "42", leaders: true, level: 1 },
        },
        {
          kind: "body",
          text: "Apartado anidado",
          toc: { title: "Apartado anidado", label: "137", leaders: true, level: 2 },
        },
      ],
    },
  ],
};

function documentXml(bytes: Uint8Array): string {
  const entries: Map<string, ZipEntryLeida> = zipEntries(bytes);
  const entry = entries.get("word/document.xml");

  if (!entry) {
    throw new Error("Falta word/document.xml");
  }

  return new TextDecoder().decode(entry.data);
}

describe("índice en DOCX", () => {
  const xml = documentXml(buildDocx(DOCUMENTO, FECHA));

  it("usa una tabulación derecha con relleno de puntos en vez de caracteres", () => {
    expect(xml).toContain('<w:tab w:val="right" w:leader="dot" w:pos="9070"/>');
    expect(xml).toContain("<w:tab/>");
    expect(xml).toContain("Capítulo primero");
    expect(xml).toContain("42");
    expect(xml).not.toContain("....");
  });

  it("respeta el tamaño de página, los márgenes y las líneas de la inicial", () => {
    const conCapitular: ExportDocumentModel = {
      ...DOCUMENTO,
      chapters: [
        {
          id: "capitulo",
          title: "Uno",
          showTitle: false,
          dropCap: true,
          blocks: [
            {
              kind: "body",
              text: "Capítulo primero",
              toc: { title: "Capítulo primero", label: "42", leaders: true, level: 1 },
            },
            { kind: "body", text: "Aquella casa" },
          ],
        },
      ],
    };
    const xml = documentXml(
      buildDocx(conCapitular, FECHA, undefined, {
        pageWidthMm: 148,
        pageHeightMm: 210,
        marginTopMm: 20,
        marginBottomMm: 20,
        marginInnerMm: 18,
        marginOuterMm: 14,
        gutterMm: 0,
        dropCapLines: 2,
      }),
    );

    expect(xml).toContain('<w:pgSz w:w="8391" w:h="11906"/>');
    expect(xml).toContain('w:right="794"');
    expect(xml).toContain('w:left="1020"');
    expect(xml).toContain('w:pos="6577"');
    expect(xml).toContain('w:lines="2"');
  });

  it("sangra los niveles anidados sin repetir el folio en el texto", () => {
    expect(xml).toContain('<w:ind w:left="283"/>');
    expect(xml).toContain("Apartado anidado");
    expect(xml).toContain("137");
  });
});
