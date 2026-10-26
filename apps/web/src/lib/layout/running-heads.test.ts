import { describe, expect, it } from "vitest";
import { resolvePageDecorations, resolveRunningHeads } from "./running-heads";
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
      [page({ blocks: [{ ...block, kind: "body", startsChapter: false, firstOfSection: false }] })],
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
          kind: "body",
          firstOfSection: false,
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

  it("no repite el encabezado en el primer capítulo aunque no fuerce un salto previo", () => {
    const opening = page({ blocks: [{ ...page().blocks[0]!, startsChapter: false }] });
    const [resolved] = resolveRunningHeads(
      [opening],
      { runningHead: { recto: "{libro}", verso: "{capitulo}" } },
      "La obra",
    );
    expect(resolved?.runningHead).toBeNull();
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

describe("resolvePageDecorations", () => {
  const bodyPage = (overrides: Partial<LaidOutPage> = {}): LaidOutPage => {
    const base = page(overrides);
    return {
      ...base,
      blocks: base.blocks.map((block) => ({
        ...block,
        kind: "body" as const,
        startsChapter: false,
        firstOfSection: false,
      })),
    };
  };

  it("deriva cabecera centrada y folio inferior", () => {
    const [resolved] = resolvePageDecorations([bodyPage()], null, { bookTitle: "La obra" });

    expect(resolved?.marginBoxes).toEqual([
      { position: "top-center", text: "Capítulo I", align: "center" },
      { position: "bottom-center", text: "1", align: "center" },
    ]);
    expect(resolved?.folioLabel).toBe("1");
    expect(resolved?.runningHead).toBe("Capítulo I");
  });

  it("respeta la plantilla de cabecera con tokens", () => {
    const [resolved] = resolvePageDecorations(
      [bodyPage()],
      { runningHead: { recto: "{libro} · {capitulo}", verso: "{libro}" } },
      { bookTitle: "La obra" },
    );

    expect(resolved?.runningHead).toBe("La obra · Capítulo I");
  });

  it("coloca el folio en el borde exterior según el lado", () => {
    const verso = resolvePageDecorations(
      [bodyPage({ side: "verso", folio: 8 })],
      { runningHead: { recto: "", verso: "" }, folioPosition: "bottomOuter" },
      { bookTitle: "La obra" },
    )[0];
    const recto = resolvePageDecorations(
      [bodyPage({ side: "recto", folio: 9 })],
      { runningHead: { recto: "", verso: "" }, folioPosition: "bottomOuter" },
      { bookTitle: "La obra" },
    )[0];

    expect(verso?.marginBoxes?.find((box) => box.position === "bottom-left")?.text).toBe("8");
    expect(recto?.marginBoxes?.find((box) => box.position === "bottom-right")?.text).toBe("9");
  });

  it("aplica numeración romana al folio y a las cajas", () => {
    const [resolved] = resolvePageDecorations(
      [bodyPage({ folio: 12 })],
      { runningHead: { recto: "", verso: "" }, pageNumbering: "roman-lower" },
      { bookTitle: "La obra" },
    );

    expect(resolved?.folioLabel).toBe("xii");
    expect(resolved?.marginBoxes?.find((box) => box.position === "bottom-center")?.text).toBe(
      "xii",
    );
  });

  it("usa marginBoxes explícitas con autoría, total de páginas y capa first", () => {
    const [firstPage, secondPage] = resolvePageDecorations(
      [bodyPage({ folio: 3 }), bodyPage({ folio: 4 })],
      {
        runningHead: { recto: "", verso: "" },
        marginBoxes: {
          base: { "top-left": "{autor}", "top-right": "{folio} / {paginas}" },
          first: { "top-left": "" },
        },
      },
      { bookTitle: "La obra", author: "Ana Torres", pageCount: 240 },
    );

    expect(firstPage?.marginBoxes).toEqual([
      { position: "top-right", text: "3 / 240", align: "right" },
    ]);
    expect(secondPage?.marginBoxes).toEqual([
      { position: "top-left", text: "Ana Torres", align: "left" },
      { position: "top-right", text: "4 / 240", align: "right" },
    ]);
  });

  it("no imprime folio si el perfil lo desactiva y conserva la cabecera", () => {
    const [resolved] = resolvePageDecorations([bodyPage()], null, {
      bookTitle: "La obra",
      showPageNumbers: false,
    });

    expect(resolved?.marginBoxes).toEqual([
      { position: "top-center", text: "Capítulo I", align: "center" },
    ]);
  });

  it("deja la apertura de capítulo sin cabecera pero con folio", () => {
    const [resolved] = resolvePageDecorations([page()], null, { bookTitle: "La obra" });

    expect(resolved?.marginBoxes?.some((box) => box.position === "top-center")).toBe(false);
    expect(resolved?.marginBoxes?.some((box) => box.position === "bottom-center")).toBe(true);
  });
});
