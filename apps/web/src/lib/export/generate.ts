import "server-only";
import { createHash } from "node:crypto";
import {
  buildDocx,
  buildEpub,
  buildPdf,
  type ExportBlock,
  type ExportChapter,
  type ExportDocumentModel,
  type ExportImageMap,
  type ImageTarget,
  type PdfImage,
  type PdfPage,
  type PdfRun,
} from "@escribiendo/export-engine";
import {
  measureTextMm,
  paginate,
  withTypographyDefaults,
  type LaidOutPage,
  type PageGeometry,
} from "@escribiendo/editorial-engine";
import { getBookEdition, getDefaultLayoutProfile } from "@/lib/layout/profiles";
import { bookToBlocks, isChapterType } from "@/lib/layout/blocks";
import type { SessionContext } from "@/lib/auth/session";
import type { ExportSection } from "./manuscript";
import { sectionToBlocks } from "./manuscript";
import { loadExportImages } from "./images";

/**
 * Generación de los archivos de exportación.
 *
 * El PDF se compone con el mismo motor de paginación que la vista previa, de
 * modo que el archivo y lo que se ve en pantalla cuentan las mismas páginas.
 * El EPUB y el DOCX no dependen de la maqueta: son formatos reflowables.
 */

export type ExportFormat = "PDF_DIGITAL" | "PDF_PRINT" | "EPUB3" | "DOCX";

export interface ExportMetadata {
  /** Tamaño del archivo, en bytes. */
  bytes: number;
  /** Huella del contenido, para comprobar que la descarga es la esperada. */
  sha256: string;
  /** Páginas, en los formatos paginados. */
  pageCount: number | null;
  wordCount: number;
  sectionCount: number;
  /** Momento de la generación, en ISO. */
  generatedAt: string;
  /** Si la composición se ha estimado sin métricas reales de la fuente. */
  estimatedPagination: boolean;
  /**
   * Caracteres que el archivo no ha podido representar, si los hay. No se
   * pierde nada en silencio: se avisa.
   */
  caracteresPerdidos: string[];
  /** Imágenes que se han incorporado al archivo. */
  imagenesIncrustadas: number;
  /** Imágenes que no se han podido resolver y quedan marcadas o como texto. */
  imagenesOmitidas: number;
}

export interface GeneratedFile {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  metadata: ExportMetadata;
}

export interface GenerateInput {
  format: ExportFormat;
  title: string;
  author: string;
  sections: ExportSection[];
  /** Perfil de página; necesario para el PDF. */
  profile: {
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
  } | null;
  typography: unknown;
  /** Imágenes ya resueltas, para pruebas o para una exportación reproducible. */
  images?: ExportImageMap;
  /** Fecha de creación del documento; fija el resultado para que sea reproducible. */
  createdAt: Date;
}

/** Extensión y tipo de cada formato. */
const FORMAT_INFO: Record<ExportFormat, { extension: string; mimeType: string }> = {
  PDF_DIGITAL: { extension: "pdf", mimeType: "application/pdf" },
  PDF_PRINT: { extension: "pdf", mimeType: "application/pdf" },
  EPUB3: { extension: "epub", mimeType: "application/epub+zip" },
  DOCX: {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

/** Nombre de archivo seguro a partir del título. */
export function fileNameFor(title: string, format: ExportFormat): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase()
    .slice(0, 80);

  return `${base || "libro"}.${FORMAT_INFO[format].extension}`;
}

function geometryFromProfile(profile: NonNullable<GenerateInput["profile"]>): PageGeometry {
  return {
    pageWidthMm: profile.pageWidthMm,
    pageHeightMm: profile.pageHeightMm,
    marginTopMm: profile.marginTopMm,
    marginBottomMm: profile.marginBottomMm,
    marginInnerMm: profile.marginInnerMm,
    marginOuterMm: profile.marginOuterMm,
    gutterMm: profile.gutterMm,
    headerDistanceMm: profile.headerDistanceMm,
    footerDistanceMm: profile.footerDistanceMm,
    chapterStartsRecto: profile.chapterStartsRecto,
  };
}

/** Convierte las páginas compuestas en texto para el PDF. */
function toPdfPages(
  pages: LaidOutPage[],
  profile: NonNullable<GenerateInput["profile"]>,
  typography: ReturnType<typeof withTypographyDefaults>,
  images: ExportImageMap,
): {
  pdfPages: PdfPage[];
  textWidthMm: number;
  imagenesIncrustadas: number;
  imagenesOmitidas: number;
} {
  const textWidthMm =
    profile.pageWidthMm - profile.marginInnerMm - profile.marginOuterMm - profile.gutterMm;
  let imagenesIncrustadas = 0;
  let imagenesOmitidas = 0;

  const pdfPages: PdfPage[] = pages.map((page) => {
    const interior = profile.mirrorMargins ? page.side === "recto" : true;
    const leftMm = interior ? profile.marginInnerMm + profile.gutterMm : profile.marginOuterMm;

    const runs: PdfRun[] = [];
    const pdfImages: PdfImage[] = [];
    let y = profile.marginTopMm;

    for (const block of page.blocks) {
      const lineHeightMm = (block.style.fontSizePt * block.style.lineHeight * 25.4) / 72;
      y += block.spaceBeforeMm;

      // Separador de escena: no tiene líneas de texto, pero ocupa su renglón.
      if (block.kind === "rule") {
        const marca = "* * *";
        const ancho = measureTextMm(marca, {
          fontFamily: block.style.fontFamily,
          fontSizePt: block.style.fontSizePt,
        });

        runs.push({
          text: marca,
          font: "regular",
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
            const ancho = measureTextMm(captionLine, {
              fontFamily: block.style.fontFamily,
              fontSizePt: layout.captionFontSizePt,
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
        const baseFont: "regular" | "bold" | "italic" = block.kind.startsWith("heading")
          ? "bold"
          : block.kind === "blockquote"
            ? "italic"
            : "regular";
        const baseBold = baseFont === "bold";
        const baseItalic = baseFont === "italic";
        const measure = (text: string, bold: boolean): number =>
          measureTextMm(text, {
            fontFamily: block.style.fontFamily,
            fontSizePt: block.style.fontSizePt,
            letterSpacingPt: block.style.letterSpacingPt,
            bold,
          }) || 0;

        const segments =
          line.segments && line.segments.length > 0 ? line.segments : [{ text: line.text }];

        const naturalWidth = segments.reduce(
          (sum, segment) => sum + measure(segment.text, baseBold || segment.marks?.bold === true),
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
          const segmentWidth = measure(segment.text, bold);
          const sizePt =
            block.style.fontSizePt *
            (segment.marks?.superscript || segment.marks?.subscript ? 0.72 : 1);
          const risePt = segment.marks?.superscript
            ? block.style.fontSizePt * 0.38
            : segment.marks?.subscript
              ? -block.style.fontSizePt * 0.18
              : undefined;

          runs.push({
            text: segment.text,
            font,
            sizePt,
            xMm: x,
            baselineMm,
            widthMm: segmentWidth,
            ...(wordSpacing > 0 ? { wordSpacing } : {}),
            ...(segment.marks?.underline ? { underline: true } : {}),
            ...(segment.marks?.strike ? { strike: true } : {}),
            ...(risePt !== undefined ? { risePt } : {}),
          });

          x += segmentWidth;
        }

        y += lineHeightMm;
      });

      y += block.spaceAfterMm;
    }

    // El folio va al pie de la página. Se deja un mínimo de 4 mm para que un
    // perfil antiguo con distancia cero no lo deje pegado al borde de la hoja.
    if (profile.showPageNumbers) {
      const footerDistance = Math.max(profile.footerDistanceMm, 4);

      runs.push({
        text: String(page.folio),
        font: "regular",
        sizePt: 9,
        xMm: leftMm + textWidthMm / 2 - 2,
        baselineMm: profile.pageHeightMm - footerDistance,
      });
    }

    return {
      widthMm: profile.pageWidthMm,
      heightMm: profile.pageHeightMm,
      runs,
      ...(pdfImages.length > 0 ? { images: pdfImages } : {}),
      bleedMm: profile.bleedMm,
      cropMarks: false,
    };
  });

  void typography;

  return { pdfPages, textWidthMm, imagenesIncrustadas, imagenesOmitidas };
}

/** Genera el archivo en el formato pedido. */
export async function generateFile(input: GenerateInput): Promise<GeneratedFile> {
  const info = FORMAT_INFO[input.format];
  const sectionBlocks = input.sections.map((section) => sectionToBlocks(section));
  const wordCount = sectionBlocks.reduce(
    (total, blocks) =>
      total + blocks.reduce((sum, block) => sum + (block.text.match(/\S+/gu)?.length ?? 0), 0),
    0,
  );

  const sources = sectionBlocks.flatMap((blocks) =>
    blocks.flatMap((block) => (block.image?.src ? [block.image.src] : [])),
  );
  const target: ImageTarget =
    input.format === "EPUB3" ? "epub" : input.format === "DOCX" ? "docx" : "pdf";
  const loadedImages = await loadExportImages({
    sources,
    target,
    ...(input.images ? { provided: input.images } : {}),
  });
  const imageOccurrences = sectionBlocks.reduce(
    (total, blocks) =>
      total + blocks.filter((block) => block.kind === "image" && block.image?.src).length,
    0,
  );
  const embeddedOccurrences = sectionBlocks.reduce(
    (total, blocks) =>
      total +
      blocks.filter(
        (block) =>
          block.kind === "image" &&
          block.image?.src !== undefined &&
          loadedImages.assets.has(block.image.src),
      ).length,
    0,
  );

  let bytes: Uint8Array;
  let pageCount: number | null = null;
  let caracteresPerdidos: string[] = [];
  let imagenesIncrustadas = embeddedOccurrences;
  let imagenesOmitidas = Math.max(0, imageOccurrences - embeddedOccurrences);

  if (input.format === "PDF_DIGITAL" || input.format === "PDF_PRINT") {
    if (!input.profile) {
      throw new Error(
        "El libro necesita una plantilla de maquetación para exportar a PDF. Configúrala antes de exportar.",
      );
    }

    const typography = withTypographyDefaults(input.typography);
    const blocks = bookToBlocks(
      input.sections.map((section) => ({
        id: section.id,
        title: section.title,
        type: section.type,
        content: section.content,
        isChapter: isChapterType(section.type),
        startOnOddPage: false,
      })),
    );

    const composition = paginate(blocks, geometryFromProfile(input.profile), typography);
    const pdfComposition = toPdfPages(
      composition.pages,
      input.profile,
      typography,
      loadedImages.assets,
    );
    const pdfPages = pdfComposition.pdfPages;

    pageCount = pdfPages.length;

    const pdf = buildPdf({
      title: input.title,
      author: input.author,
      subject: input.format === "PDF_PRINT" ? "Documento para imprenta" : "Documento digital",
      createdAt: input.createdAt,
      language: "es",
      pages:
        input.format === "PDF_PRINT"
          ? pdfPages.map((page) => ({ ...page, cropMarks: true }))
          : pdfPages,
    });

    bytes = pdf.bytes;
    caracteresPerdidos = pdf.caracteresPerdidos;
    imagenesIncrustadas = pdf.imagenesIncrustadas;
    imagenesOmitidas = pdf.imagenesOmitidas;
  } else {
    const chapters: ExportChapter[] = input.sections.map((section, index) => ({
      id: section.id,
      title: section.title,
      blocks: (sectionBlocks[index] ?? []).map((block): ExportBlock => ({
        kind: block.kind,
        text: block.text,
        ...(block.runs ? { runs: block.runs } : {}),
        ...(block.image ? { image: block.image } : {}),
      })),
    }));

    const model: ExportDocumentModel = {
      title: input.title,
      author: input.author,
      language: "es",
      identifier: `urn:uuid:${createHash("sha256")
        .update(`${input.title}:${input.author}`)
        .digest("hex")
        .slice(0, 32)
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, "$1-$2-$3-$4-$5")}`,
      chapters,
    };

    bytes =
      input.format === "EPUB3"
        ? buildEpub(model, input.createdAt, loadedImages.assets)
        : buildDocx(model, input.createdAt, loadedImages.assets);
  }

  return {
    bytes,
    fileName: fileNameFor(input.title, input.format),
    mimeType: info.mimeType,
    metadata: {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      pageCount,
      wordCount,
      sectionCount: input.sections.length,
      generatedAt: input.createdAt.toISOString(),
      estimatedPagination: input.format === "PDF_DIGITAL" || input.format === "PDF_PRINT",
      caracteresPerdidos,
      imagenesIncrustadas,
      imagenesOmitidas,
    },
  };
}

/** Datos de exportación de un libro, con su perfil y su tipografía. */
export async function exportContext(
  session: SessionContext,
  bookId: string,
): Promise<{
  title: string;
  author: string;
  profile: NonNullable<GenerateInput["profile"]> | null;
  typography: unknown;
}> {
  const [edition, defaultProfile] = await Promise.all([
    getBookEdition(session, bookId),
    getDefaultLayoutProfile(session),
  ]);

  const profile = edition?.profile ?? defaultProfile;
  const typography = edition?.template
    ? edition.template.config.typography
    : (profile?.typography ?? {});

  return {
    title: edition?.name ?? "Manuscrito",
    author: "ESCRIBIENDO",
    profile,
    typography,
  };
}
