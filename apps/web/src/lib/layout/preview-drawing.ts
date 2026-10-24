import {
  isHeadingKind,
  textLinePlacement,
  type LaidOutPage,
  type MeasureText,
} from "@escribiendo/editorial-engine";

/** Posición horizontal y vertical preparada para una línea de la vista previa. */
export interface PreviewLineDrawing {
  blockIndex: number;
  lineIndex: number;
  leftMm: number;
  widthMm: number;
  wordSpacingPt: number;
  baselineMm: number;
  text: string;
  bold: boolean;
  /** Columna de folio de una entrada de índice, relativa a la página. */
  toc?: {
    folioText: string;
    folioXMm: number;
    folioWidthMm: number;
    leaderStartMm: number | null;
    leaderEndMm: number | null;
    dotted: boolean;
  };
}

/** Prepara la geometría CSS con las mismas métricas que usa el escritor de PDF. */
export function previewLineDrawings(
  page: LaidOutPage,
  textWidthMm: number,
  pageLeftMm: number,
  measure?: MeasureText,
  pageTopMm = 0,
): PreviewLineDrawing[] {
  const drawings: PreviewLineDrawing[] = [];
  let yMm = pageTopMm;

  page.blocks.forEach((block, blockIndex) => {
    yMm += block.spaceBeforeMm;

    if (block.kind === "image") {
      yMm += block.imageLayout?.totalHeightMm ?? 0;
      yMm += block.spaceAfterMm;
      return;
    }

    const lineHeightMm = (block.style.fontSizePt * block.style.lineHeight * 25.4) / 72;

    if (block.kind === "rule") {
      yMm += lineHeightMm + block.spaceAfterMm;
      return;
    }

    block.lines.forEach((line, lineIndex) => {
      const placement = textLinePlacement(block, lineIndex, textWidthMm, pageLeftMm, measure);

      drawings.push({
        blockIndex,
        lineIndex,
        leftMm: placement.xMm - pageLeftMm,
        widthMm: placement.widthMm,
        wordSpacingPt: placement.wordSpacingPt,
        baselineMm: yMm + lineHeightMm * 0.8,
        text: line.text,
        bold: isHeadingKind(block.kind),
        ...(line.toc
          ? {
              toc: {
                folioText: line.toc.text,
                folioXMm: line.toc.xMm,
                folioWidthMm: line.toc.widthMm,
                leaderStartMm: line.toc.leaderStartMm,
                leaderEndMm: line.toc.leaderEndMm,
                dotted: line.toc.dotted,
              },
            }
          : {}),
      });
      yMm += lineHeightMm;
    });

    yMm += block.spaceAfterMm;
  });

  return drawings;
}
