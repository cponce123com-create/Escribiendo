import {
  measureTextMm,
  type LaidOutPage,
  type MeasureText,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import type {
  ExportImageMap,
  PdfImage,
  PdfOutlineItem,
  PdfPage,
  PdfRule,
  PdfRun,
} from "@escribiendo/export-engine";

/**
 * Traduce las páginas compuestas por el motor editorial a las instrucciones
 * primitivas que dibuja el escritor de PDF.
 *
 * La función es pura y no toca la base de datos: recibe exactamente las mismas
 * páginas que la vista previa y conserva sus líneas, sus estilos y sus
 * posiciones. Así se puede comprobar en pruebas que ambos caminos cuentan la
 * misma composición.
 */

/** Geometría y opciones de página que necesita el escritor de PDF. */
export interface PdfPageProfile {
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginInnerMm: number;
  marginOuterMm: number;
  gutterMm: number;
  headerDistanceMm: number;
  footerDistanceMm: number;
  mirrorMargins: boolean;
  showPageNumbers: boolean;
}

export interface PdfPageConversionInput {
  pages: LaidOutPage[];
  profile: PdfPageProfile;
  typography: TypographyConfig;
  images: ExportImageMap;
  /** Sangrado que se añade a la hoja física. En digital debe ser cero. */
  bleedMm: number;
  measure?: MeasureText;
}

export interface PdfPageConversionResult {
  pdfPages: PdfPage[];
  textWidthMm: number;
  imagenesIncrustadas: number;
  imagenesOmitidas: number;
}

/**
 * Construye los marcadores del PDF a partir de la primera página de cada
 * sección. Se usa el título editorial de la sección, no el texto del bloque:
 * así el marcador sigue siendo el mismo aunque el manuscrito empiece con un
 * encabezado equivalente.
 */
export function outlineFromPages(
  pages: readonly LaidOutPage[],
  sections: readonly {
    id: string;
    title: string;
    showInToc: boolean;
    displayTitle?: string | null;
  }[],
): PdfOutlineItem[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const seen = new Set<string>();
  const outline: PdfOutlineItem[] = [];

  pages.forEach((page, pageIndex) => {
    for (const block of page.blocks) {
      if (!block.sectionId || !block.firstOfSection || seen.has(block.sectionId)) {
        continue;
      }

      seen.add(block.sectionId);
      const section = byId.get(block.sectionId);
      // Si no se insertó el bloque de título porque el manuscrito ya abre con
      // un encabezado equivalente, el marcador usa ese mismo título para no
      // prometer en el índice una composición que el cuerpo no muestra.
      const title =
        block.kind === "title"
          ? (section?.displayTitle ?? section?.title ?? "")
          : (section?.title ?? "");

      if (section && section.showInToc && title.trim().length > 0) {
        outline.push({ title, pageIndex });
      }
    }
  });

  return outline;
}

export function toPdfPages({
  pages,
  profile,
  typography,
  images,
  bleedMm,
  measure,
}: PdfPageConversionInput): PdfPageConversionResult {
  const textWidthMm =
    profile.pageWidthMm - profile.marginInnerMm - profile.marginOuterMm - profile.gutterMm;
  const medir = (text: string, options: Parameters<typeof measureTextMm>[1]): number =>
    measureTextMm(text, {
      ...options,
      ...(measure ? { measure } : {}),
    });
  let imagenesIncrustadas = 0;
  let imagenesOmitidas = 0;

  const pdfPages: PdfPage[] = pages.map((page) => {
    const interior = profile.mirrorMargins ? page.side === "recto" : true;
    const leftMm = interior ? profile.marginInnerMm + profile.gutterMm : profile.marginOuterMm;

    const runs: PdfRun[] = [];
    const pdfImages: PdfImage[] = [];
    const rules: PdfRule[] = [];
    let y = profile.marginTopMm;

    // El encabezado de página se dibuja en el mismo lugar que en la vista
    // previa y con la misma familia y tamaño. La paginación ya lo deja vacío
    // en la página que abre capítulo para no repetir el título.
    if (page.runningHead && !page.blank) {
      const sizePt = 8;
      const ancho = medir(page.runningHead, {
        fontFamily: typography.body.fontFamily,
        fontSizePt: sizePt,
      });

      runs.push({
        text: page.runningHead,
        font: "regular",
        family: typography.body.fontFamily,
        sizePt,
        xMm: leftMm + Math.max(0, (textWidthMm - ancho) / 2),
        baselineMm: profile.headerDistanceMm + (sizePt * 0.8 * 25.4) / 72,
      });
    }

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

        y += lineHeightMm + block.spaceAfterMm;
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
        const baseFont: "regular" | "bold" | "italic" =
          block.kind === "title" || block.kind.startsWith("heading")
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
          letterSpacingPt = block.style.letterSpacingPt,
        ): number =>
          medir(text, {
            fontFamily: block.style.fontFamily,
            fontSizePt: sizePt,
            letterSpacingPt,
            bold,
            italic,
          }) || 0;
        const segmentSize = (segment: (typeof segments)[number]): number =>
          block.style.fontSizePt *
          (segment.marks?.superscript || segment.marks?.subscript ? 0.72 : 1);

        const segments =
          line.segments && line.segments.length > 0 ? line.segments : [{ text: line.text }];

        const naturalWidth = segments.reduce(
          (sum, segment) =>
            sum +
            measureSegment(
              segment.text,
              segmentSize(segment),
              baseBold || segment.marks?.bold === true,
              baseItalic || segment.marks?.italic === true,
            ),
          0,
        );

        let x = leftMm;
        let wordSpacing = 0;

        if (block.style.alignment === "center") {
          x = leftMm + Math.max(0, (textWidthMm - naturalWidth) / 2);
        } else if (block.style.alignment === "right") {
          x = leftMm + Math.max(0, textWidthMm - naturalWidth);
        } else if (block.style.alignment === "justify") {
          const esUltima = index === block.lines.length - 1;
          const espacios = segments.reduce(
            (sum, segment) => sum + (segment.text.match(/ /gu)?.length ?? 0),
            0,
          );

          if (!esUltima && espacios > 0) {
            // El ancho extra se reparte entre los espacios, como hace el
            // justificado de un libro.
            const extra = Math.max(0, textWidthMm - naturalWidth) / espacios;
            wordSpacing = (extra * 72) / 25.4;
          }
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
          const sizePt = segmentSize(segment);
          // El texto se dibuja en mayúsculas si el estilo lo pide: la
          // medición ya cuenta con esa transformación, así que el ancho y el
          // dibujo tienen que ir juntos.
          const texto = block.style.uppercase ? segment.text.toLocaleUpperCase("es") : segment.text;
          const segmentWidth = measureSegment(texto, sizePt, bold, italic);
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
            family: block.style.fontFamily,
            sizePt,
            xMm: x,
            baselineMm,
            widthMm: advanceMm,
            ...(wordSpacing > 0 ? { wordSpacing } : {}),
            ...(block.style.letterSpacingPt !== 0
              ? { letterSpacingPt: block.style.letterSpacingPt }
              : {}),
            ...(segment.marks?.underline ? { underline: true } : {}),
            ...(segment.marks?.strike ? { strike: true } : {}),
            ...(risePt !== undefined ? { risePt } : {}),
          });

          x += advanceMm;
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
      bleedMm,
      cropMarks: false,
    };
  });

  return { pdfPages, textWidthMm, imagenesIncrustadas, imagenesOmitidas };
}
