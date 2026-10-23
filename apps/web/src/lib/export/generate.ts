import "server-only";
import { createHash } from "node:crypto";
import {
  buildDocx,
  buildEpub,
  buildPdf,
  type ExportImage,
  type ExportDocumentModel,
  type ExportImageMap,
  type ImageTarget,
} from "@escribiendo/export-engine";
import { paginate, withTypographyDefaults, type PageGeometry } from "@escribiendo/editorial-engine";
import { getBookEdition, getDefaultLayoutProfile } from "@/lib/layout/profiles";
import { bookToBlocks, isChapterType } from "@/lib/layout/blocks";
import type { SessionContext } from "@/lib/auth/session";
import type { ExportSection } from "./manuscript";
import { sectionToBlocks } from "./manuscript";
import { loadExportImages } from "./images";
import { loadPdfFonts } from "./fonts";
import { toPdfPages, type PdfLayoutProfile } from "./pdf-layout";
import { chaptersForReflowableFormats } from "./chapter-titles";
import type { RunningHeadTemplate } from "@/lib/layout/running-heads";

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
  /** Fuentes TrueType incrustadas en el PDF. */
  fuentesIncrustadas: number;
  /** Fuentes que no se han podido interpretar y han caído a Times. */
  fuentesOmitidas: number;
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
  profile: PdfLayoutProfile | null;
  typography: unknown;
  /** Encabezados de página guardados en la plantilla editorial. */
  runningHeadTemplate?: RunningHeadTemplate | null;
  /** Título del libro usado para resolver `{libro}` en el encabezado. */
  bookTitle?: string;
  /** Activa una inicial capitular en el primer párrafo de cada capítulo. */
  dropCaps?: boolean;
  /** Imágenes ya resueltas, para pruebas o para una exportación reproducible. */
  images?: ExportImageMap;
  /** Portada del libro, cuando existe. */
  cover?: ExportImage;
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

/** Genera el archivo en el formato pedido. */
export async function generateFile(input: GenerateInput): Promise<GeneratedFile> {
  const info = FORMAT_INFO[input.format];
  const footnoteCounter = { next: 1 };
  const sectionBlocks = input.sections.map((section) => sectionToBlocks(section, footnoteCounter));
  const wordCount = sectionBlocks.reduce(
    (total, blocks) =>
      total + blocks.reduce((sum, block) => sum + (block.text.match(/\S+/gu)?.length ?? 0), 0),
    0,
  );

  const sources = sectionBlocks.flatMap((blocks) =>
    blocks.flatMap((block) => (block.image?.src ? [block.image.src] : [])),
  );
  if (input.cover?.src) {
    sources.push(input.cover.src);
  }
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
  let estimatedPagination = false;
  let fuentesIncrustadas = 0;
  let fuentesOmitidas = 0;

  if (input.format === "PDF_DIGITAL" || input.format === "PDF_PRINT") {
    if (!input.profile) {
      throw new Error(
        "El libro necesita una plantilla de maquetación para exportar a PDF. Configúrala antes de exportar.",
      );
    }

    const typography = withTypographyDefaults(input.typography);
    // La maqueta del PDF es la misma que la de la vista previa: si aquí se
    // ignorara el salto de página o la apertura en recto, los dos archivos
    // dirían cosas distintas.
    const blocks = bookToBlocks(
      input.sections.map((section) => ({
        id: section.id,
        title: section.title,
        type: section.type,
        content: section.content,
        isChapter: isChapterType(section.type),
        startOnOddPage: section.startOnOddPage,
        pageBreakBefore: section.pageBreakBefore,
        includeInExport: section.includeInExport,
      })),
      { dropCaps: input.dropCaps === true },
    );
    const pdfFonts = await loadPdfFonts();
    const measure = pdfFonts?.measure;
    estimatedPagination = !pdfFonts;

    const composition = paginate(blocks, geometryFromProfile(input.profile), typography, measure);
    const pdfComposition = toPdfPages(
      composition.pages,
      input.profile,
      typography,
      loadedImages.assets,
      measure,
      input.runningHeadTemplate,
      input.bookTitle ?? input.title,
    );
    const pdfPages = pdfComposition.pdfPages;

    const cover = input.cover;
    const coverAsset = cover?.src ? loadedImages.assets.get(cover.src) : undefined;
    if (coverAsset) {
      pdfPages.unshift({
        widthMm: input.profile.pageWidthMm,
        heightMm: input.profile.pageHeightMm,
        runs: [],
        images: [
          {
            topMm: 0,
            xMm: 0,
            widthMm: input.profile.pageWidthMm,
            heightMm: input.profile.pageHeightMm,
            data: coverAsset.data,
            pixelWidth: coverAsset.width,
            pixelHeight: coverAsset.height,
            alt: cover?.alt ?? `Portada de ${input.title}`,
          },
        ],
      });
    }

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
      ...(pdfFonts ? { fonts: pdfFonts.programs } : {}),
    });

    bytes = pdf.bytes;
    caracteresPerdidos = pdf.caracteresPerdidos;
    imagenesIncrustadas = pdf.imagenesIncrustadas;
    imagenesOmitidas = pdf.imagenesOmitidas;
    fuentesIncrustadas = pdf.fuentesIncrustadas;
    fuentesOmitidas = pdf.fuentesOmitidas;
  } else {
    const chapters = chaptersForReflowableFormats(
      input.sections,
      sectionBlocks,
      input.dropCaps === true,
    );

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
      cover: input.cover,
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
      estimatedPagination,
      caracteresPerdidos,
      imagenesIncrustadas,
      imagenesOmitidas,
      fuentesIncrustadas,
      fuentesOmitidas,
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
  runningHeadTemplate: RunningHeadTemplate | null;
}> {
  const [edition, defaultProfile] = await Promise.all([
    getBookEdition(session, bookId),
    getDefaultLayoutProfile(session),
  ]);

  const profile = edition?.profile ?? defaultProfile;
  const typography = edition?.template
    ? edition.template.config.typography
    : (profile?.typography ?? {});
  const runningHeadTemplate = edition?.template?.config ?? null;

  return {
    title: edition?.name ?? "Manuscrito",
    author: "ESCRIBIENDO",
    profile,
    typography,
    runningHeadTemplate,
  };
}
