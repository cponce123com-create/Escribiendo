import "server-only";
import { createHash } from "node:crypto";
import {
  buildDocx,
  buildEpub,
  buildPdf,
  type ExportBlock,
  type ExportChapter,
  type ExportDocumentModel,
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
): { pdfPages: PdfPage[]; textWidthMm: number } {
  const textWidthMm =
    profile.pageWidthMm - profile.marginInnerMm - profile.marginOuterMm - profile.gutterMm;

  const pdfPages: PdfPage[] = pages.map((page) => {
    const interior = profile.mirrorMargins ? page.side === "recto" : true;
    const leftMm = interior ? profile.marginInnerMm + profile.gutterMm : profile.marginOuterMm;

    const runs: PdfRun[] = [];
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
      bleedMm: profile.bleedMm,
      cropMarks: false,
    };
  });

  void typography;

  return { pdfPages, textWidthMm };
}

/** Genera el archivo en el formato pedido. */
export function generateFile(input: GenerateInput): GeneratedFile {
  const info = FORMAT_INFO[input.format];
  const wordCount = input.sections.reduce(
    (total, section) =>
      total +
      sectionToBlocks(section).reduce(
        (sum, block) => sum + (block.text.match(/\S+/gu)?.length ?? 0),
        0,
      ),
    0,
  );

  let bytes: Uint8Array;
  let pageCount: number | null = null;
  /** Caracteres que el PDF no ha podido representar. */
  let caracteresPerdidos: string[] = [];

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
    const { pdfPages } = toPdfPages(composition.pages, input.profile, typography);

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
  } else {
    const chapters: ExportChapter[] = input.sections.map((section) => ({
      id: section.id,
      title: section.title,
      blocks: sectionToBlocks(section).map((block): ExportBlock => ({
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
        ? buildEpub(model, input.createdAt)
        : buildDocx(model, input.createdAt);
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
