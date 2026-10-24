import { describe, expect, it } from "vitest";
import { withTypographyDefaults, type LaidOutPage } from "@escribiendo/editorial-engine";
import { previewLineDrawings } from "@/lib/layout/preview-drawing";
import { toPdfPages, type PdfLayoutProfile } from "./pdf-layout";

const PROFILE: PdfLayoutProfile = {
  pageWidthMm: 100,
  pageHeightMm: 140,
  marginTopMm: 12,
  marginBottomMm: 12,
  marginInnerMm: 10,
  marginOuterMm: 10,
  gutterMm: 0,
  bleedMm: 0,
  headerDistanceMm: 6,
  footerDistanceMm: 6,
  mirrorMargins: false,
  showPageNumbers: false,
  chapterStartsRecto: false,
};

const TYPOGRAPHY = withTypographyDefaults({
  body: { fontSizePt: 10, lineHeight: 1.5, alignment: "justify", firstLineIndentMm: 5 },
  heading1: { fontSizePt: 16, lineHeight: 1.2, alignment: "center", spaceAfterPt: 8 },
});

const PAGE: LaidOutPage = {
  index: 1,
  folio: 1,
  side: "recto",
  blocks: [
    {
      id: "chapter-title",
      kind: "heading1",
      style: TYPOGRAPHY.heading1,
      lines: [{ text: "Capítulo uno", hyphenated: false, overflow: false }],
      spaceBeforeMm: 2,
      spaceAfterMm: 3,
    },
    {
      id: "body",
      kind: "body",
      style: TYPOGRAPHY.body,
      lines: [
        { text: "Una línea justificada con varios espacios", hyphenated: false, overflow: false },
        { text: "La continuación", hyphenated: false, overflow: false },
      ],
      spaceBeforeMm: 1,
      spaceAfterMm: 0,
      firstLineIndentMm: 5,
    },
  ],
  usedHeightMm: 0,
  totalHeightMm: 116,
  footnotes: [],
  footnotesHeightMm: 0,
  runningHead: null,
  blank: false,
};

describe("geometría compartida de vista previa y PDF", () => {
  it("iguala x, línea base, texto y negrita en el mismo LaidOutPage", () => {
    const leftMm = PROFILE.marginOuterMm;
    const textWidthMm = PROFILE.pageWidthMm - PROFILE.marginInnerMm - PROFILE.marginOuterMm;
    const preview = previewLineDrawings(PAGE, textWidthMm, leftMm, undefined, PROFILE.marginTopMm);
    const pdf = toPdfPages([PAGE], PROFILE, TYPOGRAPHY, new Map()).pdfPages[0];
    const pdfTextRuns = (pdf?.runs ?? []).filter((run) =>
      PAGE.blocks.some((block) => block.lines.some((line) => line.text === run.text)),
    );

    expect(pdfTextRuns).toHaveLength(preview.length);

    preview.forEach((line, index) => {
      const run = pdfTextRuns[index];

      expect(run?.xMm).toBeCloseTo(leftMm + line.leftMm, 5);
      expect(run?.baselineMm).toBeCloseTo(line.baselineMm, 5);
      expect(run?.text).toBe(line.text);
      expect(run?.font === "bold").toBe(line.bold);
    });
  });

  it("dibuja la inicial capitular separada y reserva su ancho", () => {
    const page: LaidOutPage = {
      ...PAGE,
      blocks: [
        {
          ...PAGE.blocks[1]!,
          dropCapCharacter: "U",
        },
      ],
    };
    const pdf = toPdfPages([page], PROFILE, TYPOGRAPHY, new Map()).pdfPages[0];
    const capital = pdf?.runs.find((run) => run.text === "U");
    const firstLine = pdf?.runs.find((run) => run.text.startsWith("na línea"));

    expect(capital?.sizePt).toBeCloseTo(TYPOGRAPHY.body.fontSizePt * 3);
    expect(firstLine?.xMm).toBeGreaterThan((capital?.xMm ?? 0) + 1);
  });

  it("coloca el folio del índice y el líder en las mismas coordenadas en PDF y vista previa", () => {
    const tocLine = {
      text: "Capítulo primero",
      hyphenated: false,
      overflow: false,
      toc: {
        text: "42",
        xMm: 78,
        widthMm: 4,
        leaderStartMm: 40,
        leaderEndMm: 76.5,
        dotted: true,
      },
    };
    const page: LaidOutPage = {
      ...PAGE,
      blocks: [{ ...PAGE.blocks[1]!, lines: [tocLine] }],
    };
    const leftMm = PROFILE.marginOuterMm;
    const textWidthMm = PROFILE.pageWidthMm - PROFILE.marginInnerMm - PROFILE.marginOuterMm;
    const preview = previewLineDrawings(page, textWidthMm, leftMm, undefined, PROFILE.marginTopMm);
    const pdf = toPdfPages([page], PROFILE, TYPOGRAPHY, new Map()).pdfPages[0];
    const folioRun = pdf?.runs.find((run) => run.text === "42");
    const rule = pdf?.rules?.[0];

    expect(preview[0]?.toc?.folioXMm).toBeCloseTo(tocLine.toc.xMm, 5);
    expect(folioRun?.xMm).toBeCloseTo(leftMm + tocLine.toc.xMm, 5);
    expect(folioRun?.baselineMm).toBeCloseTo(preview[0]!.baselineMm, 5);
    expect(rule?.x1Mm).toBeCloseTo(leftMm + tocLine.toc.leaderStartMm, 5);
    expect(rule?.x2Mm).toBeCloseTo(leftMm + tocLine.toc.leaderEndMm, 5);
    expect(rule?.dash).toEqual([0.5, 1.1]);
  });
});
