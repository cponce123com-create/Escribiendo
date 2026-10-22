import { describe, expect, it } from "vitest";
import { resolveRunningHeads } from "./running-heads";
import type { LaidOutPage } from "@escribiendo/editorial-engine";

const page = (overrides: Partial<LaidOutPage> = {}): LaidOutPage => ({
  index: 1,
  folio: 1,
  side: "recto",
  blocks: [
    {
      id: "chapter-1-title",
      kind: "chapterTitle",
      style: {
        fontFamily: "serif",
        fontSizePt: 20,
        lineHeight: 1.2,
        spaceBeforePt: 36,
        spaceAfterPt: 24,
        alignment: "center",
        firstLineIndentMm: 0,
        letterSpacingPt: 0,
        uppercase: false,
        smallCaps: false,
        hyphenation: false,
        keepWithNext: true,
      },
      lines: [{ text: "Capítulo I", hyphenated: false, overflow: false }],
      spaceBeforeMm: 12.7,
      spaceAfterMm: 8.4667,
      sectionId: "s1",
      sectionTitle: "Capítulo I",
      startsChapter: true,
      firstOfSection: true,
    },
  ],
  usedHeightMm: 0,
  totalHeightMm: 200,
  footnotes: [],
  footnotesHeightMm: 0,
  runningHead: null,
  blank: false,
  ...overrides,
});

describe("resolveRunningHeads", () => {
  it("usa el título de sección si no hay plantilla", () => {
    const block = page().blocks[0]!;
    const [resolved] = resolveRunningHeads(
      [page({ blocks: [{ ...block, startsChapter: false }] })],
      null,
      "La obra",
    );

    expect(resolved?.runningHead).toBe("Capítulo I");
  });

  it("reemplaza los marcadores y no encabeza una apertura de capítulo", () => {
    const bodyPage = page({
      blocks: [
        {
          ...page().blocks[0]!,
          startsChapter: false,
        },
      ],
    });
    const chapterPage = page();
    const template = { runningHead: { recto: "{libro} · {capitulo}", verso: "{capitulo}" } };
    const result = resolveRunningHeads([bodyPage, chapterPage], template, "La obra");

    expect(result[0]?.runningHead).toBe("La obra · Capítulo I");
    expect(result[1]?.runningHead).toBeNull();
  });

  it("no agrega encabezado a una página en blanco", () => {
    const result = resolveRunningHeads(
      [page({ blank: true, blocks: [] })],
      { runningHead: { recto: "{libro}", verso: "{libro}" } },
      "La obra",
    );

    expect(result[0]?.runningHead).toBeNull();
  });
});
