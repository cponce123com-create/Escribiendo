import {
  extractDropCapGrapheme,
  isHeadingKind,
  measureTextMm,
  textLinePlacement,
  type LaidOutPage,
  type MeasureText,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import type {
  ExportImageMap,
  PdfImage,
  PdfPage,
  PdfRule,
  PdfRun,
} from "@escribiendo/export-engine";
import { resolveRunningHeads, type RunningHeadTemplate } from "../layout/running-heads";

export interface PdfLayoutProfile {
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginInnerMm: number;
  marginOuterMm: number;
  gutterMm: number;
  bleedMm: number;
  headerDistanceMm: number;
  footerDistanceMm: number;
  mirrorMargins: boolean;
  showPageNumbers: boolean;
  chapterStartsRecto: boolean;
}

/** Convierte las páginas compuestas en texto para el PDF. */
export function toPdfPages(
  pages: LaidOutPage[],
  profile: PdfLayoutProfile,
  typography: TypographyConfig,
  images: ExportImageMap,
  measure?: MeasureText,
  runningHeadTemplate?: RunningHeadTemplate | null,
  bookTitle = "",
): {
  pdfPages: PdfPage[];
  textWidthMm: number;
  imagenesIncrustadas: number;
  imagenesOmitidas: number;
} {
  const textWidthMm =
    profile.pageWidthMm - profile.marginInnerMm - profile.marginOuterMm - profile.gutterMm;
  const medir = (text: string, options: Parameters<typeof measureTextMm>[1]): number =>
    measureTextMm(text, {
      ...options,
      ...(measure ? { measure } : {}),
    });
  let imagenesIncrustadas = 0;
  let imagenesOmitidas = 0;

  const pagesWithHeads = resolveRunningHeads(pages, runningHeadTemplate, bookTitle);
  const pdfPages: PdfPage[] = pagesWithHeads.map((page) => {
    const interior = profile.mirrorMargins ? page.side === "recto" : true;
    const leftMm = interior ? profile.marginInnerMm + profile.gutterMm : profile.marginOuterMm;

    const runs: PdfRun[] = [];
    const pdfImages: PdfImage[] = [];
    const rules: PdfRule[] = [];
    let y = profile.marginTopMm;

    for (const block of page.blocks) {
      const lineHeightMm = (block.style.fontSizePt * block.style.lineHeight * 25.4) / 72;
      y += block.spaceBeforeMm;

      // Separador de escena: no tiene líneas de texto, pero ocupa su renglón.
      if (block.kind === "rule") {
        const marca = "* * *";
        const ancho = medir(marca, {
          fontFamily: block.style.fontFamily,
          fontSizePt: block.style.fontSizePt,
        });

        runs.push({
          text: marca,
          font: "regular",
          family: block.style.fontFamily,
          sizePt: block.style.fontSizePt,
          xMm: leftMm + Math.max(0, (textWidthMm - ancho) / 2),
          baselineMm: y + lineHeightMm * 0.8,
        });

        y += lineHeightMm;
        continue;
      }

      if (block.kind === "image") {
        const layout = block.imageLayout;

        if (!layout) {
          y += block.spaceAfterMm;
          continue;
        }

        const image = block.image;
        const alignment = image?.alignment ?? "center";
        let imageX = leftMm;

        if (alignment === "center") {
          imageX += Math.max(0, (textWidthMm - layout.widthMm) / 2);
        } else if (alignment === "right") {
          imageX += Math.max(0, textWidthMm - layout.widthMm);
        }

        const asset = image?.src ? images.get(image.src) : undefined;

        if (asset) {
          imagenesIncrustadas += 1;
        } else {
          imagenesOmitidas += 1;
        }

        pdfImages.push({
          topMm: y,
          xMm: imageX,
          widthMm: layout.widthMm,
          heightMm: layout.heightMm,
          ...(asset
            ? {
                data: asset.data,
                pixelWidth: asset.width,
                pixelHeight: asset.height,
              }
            : {}),
          ...(image?.alt ? { alt: image.alt } : {}),
          ...(image?.src ? { src: image.src } : {}),
        });

        y += layout.heightMm;

        if (layout.captionLines.length > 0) {
          y += layout.captionGapMm;

          for (const captionLine of layout.captionLines) {
            const ancho = medir(captionLine, {
              fontFamily: block.style.fontFamily,
              fontSizePt: layout.captionFontSizePt,
              italic: true,
            });
            const captionX =
              alignment === "center"
                ? imageX + Math.max(0, (layout.widthMm - ancho) / 2)
                : alignment === "right"
                  ? imageX + Math.max(0, layout.widthMm - ancho)
                  : imageX;

            runs.push({
              text: captionLine,
              font: "italic",
              family: block.style.fontFamily,
              sizePt: layout.captionFontSizePt,
              xMm: captionX,
              baselineMm: y + layout.captionLineHeightMm * 0.8,
              widthMm: ancho,
            });

            y += layout.captionLineHeightMm;
          }
        }

        y += block.spaceAfterMm;
        continue;
      }

      block.lines.forEach((line, index) => {
        const baselineMm = y + lineHeightMm * 0.8;
        const baseFont: "regular" | "bold" | "italic" = isHeadingKind(block.kind)
          ? "bold"
          : block.kind === "blockquote"
            ? "italic"
            : "regular";
        const baseBold = baseFont === "bold";
        const baseItalic = baseFont === "italic";
        const measureSegment = (
          text: string,
          sizePt: number,
          bold: boolean,
          italic: boolean,
          family: typeof block.style.fontFamily = block.style.fontFamily,
          letterSpacingPt = block.style.letterSpacingPt,
        ): number =>
          medir(text, {
            fontFamily: family,
            fontSizePt: sizePt,
            letterSpacingPt,
            bold,
            italic,
          }) || 0;
        const segmentSize = (segment: (typeof segments)[number]): number =>
          block.style.fontSizePt *
          (segment.marks?.superscript || segment.marks?.subscript ? 0.72 : 1);

        const rawSegments =
          line.segments && line.segments.length > 0 ? line.segments : [{ text: line.text }];
        // Se quita exactamente el grafema de la inicial, no el primer grafema:
        // las comillas, rayas y signos de apertura deben permanecer.
        const dropCap =
          index === 0 && block.dropCapCharacter
            ? extractDropCapGrapheme(rawSegments, block.dropCapCharacter)
            : null;
        const segments = dropCap ? dropCap.segments : rawSegments;

        const placement = textLinePlacement(block, index, textWidthMm, leftMm, measure);
        let x = placement.xMm;
        const wordSpacing = placement.wordSpacingPt;

        if (dropCap?.removed && block.dropCapCharacter) {
          const capital = block.dropCapCharacter;
          const capitalText = block.style.uppercase ? capital.toLocaleUpperCase("es") : capital;
          const capitalSize = block.dropCapSizePt ?? block.style.fontSizePt * 3;
          const ascent = {
            serif: 0.891,
            "sans-serif": 0.905,
            monospace: 0.833,
          }[block.style.fontFamily];
          runs.push({
            text: capitalText,
            font: baseFont,
            family: block.style.fontFamily,
            sizePt: capitalSize,
            xMm: leftMm,
            baselineMm: baselineMm + ((capitalSize - block.style.fontSizePt) * ascent * 25.4) / 72,
          });
          // La sangría del motor ya incluye el ancho medido y la separación.
          x = Math.max(x, leftMm + (block.dropCapIndentMm ?? 0));
        }

        // Un renglón puede mezclar negrita, cursiva y redonda: cada tramo se
        // dibuja con su fuente y en su posición, no se aplana a un solo estilo.
        for (const segment of segments) {
          if (segment.text.length === 0) {
            continue;
          }

          const bold = baseBold || segment.marks?.bold === true;
          const italic = baseItalic || segment.marks?.italic === true;
          const font: PdfRun["font"] =
            bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
          const family = segment.marks?.code ? "monospace" : block.style.fontFamily;
          const sizePt = segmentSize(segment);
          // El texto se dibuja en mayúsculas si el estilo lo pide: la
          // medición ya cuenta con esa transformación, así que el ancho y el
          // dibujo tienen que ir juntos.
          const segmentText = segment.text;
          const texto = block.style.uppercase ? segmentText.toLocaleUpperCase("es") : segmentText;
          if (texto.length === 0) continue;
          const segmentWidth = measureSegment(texto, sizePt, bold, italic, family);
          const espaciosSegmento = wordSpacing > 0 ? (segment.text.match(/ /gu)?.length ?? 0) : 0;
          const extraMm = (wordSpacing * espaciosSegmento * 25.4) / 72;
          const advanceMm = segmentWidth + extraMm;
          const risePt = segment.marks?.superscript
            ? block.style.fontSizePt * 0.38
            : segment.marks?.subscript
              ? -block.style.fontSizePt * 0.18
              : undefined;

          runs.push({
            text: texto,
            font,
            family,
            sizePt,
            xMm: x,
            baselineMm,
            widthMm: advanceMm,
            ...(wordSpacing > 0 ? { wordSpacing } : {}),
            ...(segment.marks?.underline ? { underline: true } : {}),
            ...(segment.marks?.strike ? { strike: true } : {}),
            ...(risePt !== undefined ? { risePt } : {}),
          });

          x += advanceMm;
        }

        if (line.toc) {
          // Columna de folio: el motor ya midió su ancho y su posición, de
          // modo que el número no depende de cuántos puntos quepan.
          runs.push({
            text: line.toc.text,
            font: baseFont,
            family: block.style.fontFamily,
            sizePt: block.style.fontSizePt,
            xMm: leftMm + line.toc.xMm,
            baselineMm,
            widthMm: line.toc.widthMm,
          });

          if (line.toc.leaderStartMm !== null && line.toc.leaderEndMm !== null) {
            rules.push({
              x1Mm: leftMm + line.toc.leaderStartMm,
              y1Mm: baselineMm - 0.55,
              x2Mm: leftMm + line.toc.leaderEndMm,
              y2Mm: baselineMm - 0.55,
              widthPt: 0.25,
              ...(line.toc.dotted ? { dash: [0.5, 1.1] as const } : {}),
            });
          }
        }

        y += lineHeightMm;
      });

      y += block.spaceAfterMm;
    }

    // Las notas se componen al pie del área de texto, con una línea separadora.
    // La paginación ya reservó su altura; aquí solo se dibujan.
    if (page.footnotes.length > 0) {
      const footnoteFontSizePt = typography.body.fontSizePt * 0.78;
      const footnoteLineHeightMm = (footnoteFontSizePt * 1.3 * 25.4) / 72;
      const footnoteAreaTopMm =
        profile.pageHeightMm - profile.marginBottomMm - page.footnotesHeightMm;

      rules.push({
        x1Mm: leftMm,
        y1Mm: footnoteAreaTopMm + 1,
        x2Mm: leftMm + textWidthMm * 0.35,
        y2Mm: footnoteAreaTopMm + 1,
        widthPt: 0.5,
      });

      let footnoteY = footnoteAreaTopMm + 3;

      for (const note of page.footnotes) {
        for (const line of note.lines) {
          runs.push({
            text: line,
            font: "regular",
            family: typography.body.fontFamily,
            sizePt: footnoteFontSizePt,
            xMm: leftMm,
            baselineMm: footnoteY + footnoteLineHeightMm * 0.8,
          });
          footnoteY += footnoteLineHeightMm;
        }

        footnoteY += 1.5;
      }
    }

    if (page.runningHead) {
      const sizePt = 8;
      const width = medir(page.runningHead, {
        fontFamily: typography.body.fontFamily,
        fontSizePt: sizePt,
      });

      runs.push({
        text: page.runningHead,
        font: "regular",
        family: typography.body.fontFamily,
        sizePt,
        xMm: leftMm + Math.max(0, (textWidthMm - width) / 2),
        baselineMm: profile.headerDistanceMm + 2.5,
      });
    }

    // El folio va al pie de la página. Se deja un mínimo de 4 mm para que un
    // perfil antiguo con distancia cero no lo deje pegado al borde de la hoja.
    if (profile.showPageNumbers) {
      const footerDistance = Math.max(profile.footerDistanceMm, 4);
      const folio = String(page.folio);
      const anchoFolio = medir(folio, {
        fontFamily: typography.body.fontFamily,
        fontSizePt: 9,
      });

      runs.push({
        text: folio,
        font: "regular",
        family: typography.body.fontFamily,
        sizePt: 9,
        xMm: leftMm + (textWidthMm - anchoFolio) / 2,
        baselineMm: profile.pageHeightMm - footerDistance,
      });
    }

    return {
      widthMm: profile.pageWidthMm,
      heightMm: profile.pageHeightMm,
      runs,
      ...(pdfImages.length > 0 ? { images: pdfImages } : {}),
      ...(rules.length > 0 ? { rules } : {}),
      bleedMm: profile.bleedMm,
      cropMarks: false,
    };
  });

  return { pdfPages, textWidthMm, imagenesIncrustadas, imagenesOmitidas };
}
