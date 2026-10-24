import "server-only";
import { buildTocEntries } from "@escribiendo/templates";
import { createHash } from "node:crypto";
import {
  buildDocx,
  buildEpub,
  buildPdf,
  type ExportChapter,
  type ExportBlock,
  type ExportImage,
  type ExportDocumentModel,
  type ExportImageMap,
  type ImageTarget,
} from "@escribiendo/export-engine";
import { paginate, withTypographyDefaults, type PageGeometry } from "@escribiendo/editorial-engine";
import { getBookEdition, getDefaultLayoutProfile } from "@/lib/layout/profiles";
import {
  sectionToBlocks as layoutSectionToBlocks,
  bookToBlocks,
  isChapterType,
  type MatterLayout,
} from "@/lib/layout/blocks";
import {
  sectionsForMatter,
  EMPTY_MATTER,
  composeMatter,
  pageFolioBySection,
  type BookMatter,
} from "@/lib/editorial/book-matter";
import type { SessionContext } from "@/lib/auth/session";
import type { ExportSection } from "./manuscript";
import { sectionToBlocks } from "./manuscript";
import { loadExportImages } from "./images";
import { loadPdfFonts } from "./fonts";
import { toPdfPages, type PdfLayoutProfile } from "./pdf-layout";
import { outlineFromPages } from "./pdf-pages";
import { chaptersForReflowableFormats } from "./chapter-titles";
import { coverPlacement } from "./cover-placement";
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
  /** Materias editoriales ya cargadas; el índice se numera con las páginas reales. */
  matter?: BookMatter | null;
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
  if (input.cover?.src && !loadedImages.assets.has(input.cover.src)) {
    throw new Error(
      "No se pudo recuperar la portada de esta exportación. El archivo no se generará sin ella.",
    );
  }

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
    const previewSections = input.sections.map((section) => ({
      id: section.id,
      title: section.title,
      type: section.type,
      content: section.content,
      isChapter: isChapterType(section.type),
      startOnOddPage: section.startOnOddPage,
      pageBreakBefore: section.pageBreakBefore,
      includeInExport: section.includeInExport,
      showInToc: section.showInToc,
      showTitle: section.showTitle,
      showSectionType: section.showSectionType,
      showSectionNumber: section.showSectionNumber,
    }));
    const compose = (front: readonly MatterLayout[], back: readonly MatterLayout[]) =>
      bookToBlocks(sectionsForMatter(previewSections, input.matter ?? null), {
        dropCaps: input.dropCaps === true,
        frontMatter: front,
        backMatter: back,
      });
    const pdfFonts = await loadPdfFonts();
    const measure = pdfFonts?.measure;
    estimatedPagination = !pdfFonts;

    const geometry = {
      ...geometryFromProfile(input.profile),
      physicalPageOffset: input.cover ? 1 : 0,
    };
    const matter = input.matter ?? null;
    let composedMatter = matter ? composeMatter(matter, new Map()) : EMPTY_MATTER;
    let composition = paginate(
      compose(composedMatter.front, composedMatter.back),
      geometry,
      typography,
      measure,
    );

    for (let pass = 0; pass < 3 && matter; pass += 1) {
      const next = composeMatter(matter, pageFolioBySection(composition.pages));
      const nextComposition = paginate(
        compose(next.front, next.back),
        geometry,
        typography,
        measure,
      );
      const stable = next.signature === composedMatter.signature;

      composedMatter = next;
      composition = nextComposition;

      if (stable) {
        break;
      }
    }
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
      const placement = coverPlacement(
        input.profile.pageWidthMm,
        input.profile.pageHeightMm,
        coverAsset.width,
        coverAsset.height,
        cover?.crop,
      );

      pdfPages.unshift({
        widthMm: input.profile.pageWidthMm,
        heightMm: input.profile.pageHeightMm,
        runs: [],
        images: [
          {
            topMm: placement.topMm,
            xMm: placement.xMm,
            widthMm: placement.widthMm,
            heightMm: placement.heightMm,
            data: coverAsset.data,
            pixelWidth: coverAsset.width,
            pixelHeight: coverAsset.height,
            alt: cover?.alt ?? `Portada de ${input.title}`,
          },
        ],
      });
    }

    pageCount = pdfPages.length;

    // Marcadores del PDF: se calculan sobre las páginas del motor y se
    // desplazan si la portada ocupa la primera página. Así el índice del
    // archivo apunta a la página real, no a la del motor.
    const outline = outlineFromPages(composition.pages, input.sections).map((item) => ({
      ...item,
      pageIndex: item.pageIndex + (coverAsset ? 1 : 0),
    }));

    const pdf = buildPdf({
      title: input.title,
      author: input.author,
      subject: input.format === "PDF_PRINT" ? "Documento para imprenta" : "Documento digital",
      createdAt: input.createdAt,
      language: "es",
      ...(outline.length > 0 ? { outline } : {}),
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
    const reflowSections = sectionsForMatter(input.sections, input.matter ?? null);
    const reflowBlocks = reflowSections.map((section) => {
      const blocks =
        sectionBlocks[input.sections.findIndex((item) => item.id === section.id)] ?? [];
      const layoutBlocks = layoutSectionToBlocks({
        ...section,
        isChapter: isChapterType(section.type),
      });
      const headingIds = new Map<string, string[]>();
      for (const block of layoutBlocks) {
        if (block.kind.startsWith("heading")) {
          const ids = headingIds.get(block.text) ?? [];
          ids.push(block.id);
          headingIds.set(block.text, ids);
        }
      }
      return blocks.map((block) => ({
        ...block,
        ...(block.kind === "heading" ? { id: headingIds.get(block.text)?.shift() } : {}),
        ...(section.type === "DEDICATION" ? { alignment: "right" as const } : {}),
      }));
    });
    const chapters = chaptersForReflowableFormats(
      reflowSections,
      reflowBlocks,
      input.dropCaps === true,
    );

    // Materias generadas por la misma ruta; en formatos refluibles no hay folios físicos.
    const generated = input.matter ? composeMatter(input.matter, new Map()) : EMPTY_MATTER;
    const generatedChapters: ExportChapter[] = generated.front
      .filter((item) => input.format !== "EPUB3" || item.id !== "matter-toc")
      .map((item) => ({
        id: item.id,
        title:
          item.id === "matter-toc"
            ? (input.matter?.tocParameters?.tocTitle ?? "Índice")
            : "Página legal",
        showTitle: false,
        showInToc: false,
        blocks: item.blocks.map((block) => ({
          kind: (["title", "chapterTitle", "heading1", "heading2", "heading3"].includes(block.kind)
            ? "heading"
            : block.kind === "rule"
              ? "rule"
              : "body") as ExportBlock["kind"],
          text: block.text,
          ...(block.runs ? { runs: block.runs } : {}),
          ...(block.tocEntry
            ? {
                toc: {
                  title: block.tocEntry.title.trim(),
                  label: block.tocEntry.label,
                  leaders: block.tocEntry.leaders,
                  ...(block.tocEntry.level !== undefined
                    ? { level: block.tocEntry.level }
                    : {}),
                },
              }
            : {}),
          ...(["left", "center", "right"].includes(block.alignment ?? "")
            ? { alignment: block.alignment as "left" | "center" | "right" }
            : {}),
          level: block.kind === "heading2" ? 2 : 1,
        })),
      }));
    chapters.unshift(...generatedChapters);
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
      ...(input.matter
        ? {
            toc: {
              title: input.matter.tocParameters?.tocTitle ?? "Índice",
              entries: buildTocEntries(input.matter.tocSources, input.matter.tocOptions).map(
                (entry) => ({
                  ...entry,
                  sectionId:
                    reflowSections.find(
                      (section) =>
                        section.id === entry.sourceId ||
                        entry.sourceId.startsWith(`${section.id}-`),
                    )?.id ?? entry.sourceId,
                }),
              ),
            },
          }
        : {}),
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
