import "server-only";
import { cache } from "react";
import { editorialOrder } from "@/lib/books/reading-order";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import {
  withTypographyDefaults,
  type LayoutBlock,
  type LayoutDiagnostic,
  type LaidOutPage,
  type PageGeometry,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import {
  bookToBlocks,
  isChapterType,
  seccionesExportables,
  type MatterLayout,
  type PreviewSection,
} from "./blocks";
import { sectionsForMatter, type BookMatter, loadBookMatter } from "@/lib/editorial/book-matter";
import {
  stabilizeComposition,
  tocDiagnostics,
  type TocStability,
} from "@/lib/editorial/toc-stabilization";
import { resolveRunningHeads } from "./running-heads";
import { previewLineDrawings, type PreviewLineDrawing } from "./preview-drawing";
import { loadPdfFonts } from "@/lib/export/fonts";
import { outlineFromPages } from "@/lib/export/pdf-pages";
import { getBookCover } from "@/lib/books/covers";
import type { CoverCrop } from "@/lib/books/cover-shared";
import {
  getBookEdition,
  getDefaultLayoutProfile,
  type LayoutProfileSummary,
  type TemplateSummary,
} from "./profiles";

/**
 * Vista previa paginada.
 *
 * Toma el manuscrito del libro, la geometría del perfil de página y la
 * tipografía de la plantilla, y devuelve las páginas compuestas con los
 * problemas de composición detectados.
 */

export interface PreviewPage extends LaidOutPage {
  /** Encabezado ya resuelto con los marcadores de la plantilla. */
  runningHead: string | null;
  /** Posiciones de línea medidas con la misma fuente que el PDF. */
  drawnLines: PreviewLineDrawing[];
}

/** Entrada del índice (marcadores) que también llevará el PDF exportado. */
export interface PreviewOutlineItem {
  title: string;
  /** Página, empezando en cero. */
  pageIndex: number;
}

/** Portada que abre el archivo, con el recorte elegido por el autor. */
export interface PreviewCover {
  url: string;
  alt: string;
  crop: CoverCrop;
}

export interface PreviewResult {
  pages: PreviewPage[];
  diagnostics: LayoutDiagnostic[];
  profile: LayoutProfileSummary;
  template: TemplateSummary | null;
  typography: TypographyConfig;
  /** Índice del libro: las secciones visibles, con su página. */
  outline: PreviewOutlineItem[];
  /** Portada que abre el archivo, si el libro tiene una. */
  cover: PreviewCover | null;
  /** Si la composición incluye la inicial capitular, como el PDF. */
  dropCaps: boolean;
  /** Secciones que se han compuesto. */
  sectionCount: number;
  /** Palabras del manuscrito. */
  wordCount: number;
  /** Si no hay edición, se ha usado el perfil predeterminado del estudio. */
  usingDefaultProfile: boolean;
  /**
   * `true` si la composición se ha calculado con las métricas reales de la
   * fuente. Si es `false`, la paginación es aproximada.
   */
  realMetrics: boolean;
  /** Convergencia del índice y folios que no coinciden con su sección. */
  toc: TocStability;
}

/** Secciones del libro con su contenido, en orden de lectura. */
async function readPreviewSections(
  session: SessionContext,
  bookId: string,
): Promise<PreviewSection[]> {
  const sections = await prisma.bookSection.findMany({
    where: {
      bookId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      content: true,
      parentId: true,
      sortOrder: true,
      startOnOddPage: true,
      pageBreakBefore: true,
      includeInExport: true,
      showInToc: true,
      showTitle: true,
      showSectionType: true,
      showSectionNumber: true,
    },
  });

  // Una sección excluida del libro no se compone: la vista previa tiene que
  // parecerse al PDF, que tampoco la incluye.
  return seccionesExportables(editorialOrder(sections)).map((section) => ({
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
}

// Caché limitada a la petición de render: nunca comparte datos entre usuarios.
export const loadPreviewSections = cache(readPreviewSections);
const previewEdition = cache(getBookEdition);
const previewDefaultProfile = cache(getDefaultLayoutProfile);
const previewCover = cache(getBookCover);
const previewBookTitle = cache(
  async (session: SessionContext, bookId: string) =>
    (
      await prisma.book.findFirst({
        where: { id: bookId, workspaceId: session.workspace.id },
        select: { title: true },
      })
    )?.title ?? "",
);

/** Geometría de la página a partir del perfil. */
export function geometryFromProfile(profile: LayoutProfileSummary): PageGeometry {
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

/** Opciones de composición de la vista previa. */
export interface PreviewOptions {
  /** Compone la inicial capitular del primer párrafo, como el PDF. */
  dropCaps?: boolean;
  matterOverride?: BookMatter;
}

/**
 * Compone la vista previa de un libro.
 *
 * Devuelve `null` cuando el libro no tiene perfil de página: sin geometría
 * no hay maqueta que enseñar.
 */
export async function buildPreview(
  session: SessionContext,
  bookId: string,
  options: PreviewOptions = {},
): Promise<PreviewResult | null> {
  const edition = await previewEdition(session, bookId);
  const profile = edition?.profile ?? (await previewDefaultProfile(session));

  if (!profile) {
    return null;
  }

  const dropCaps = options.dropCaps === true;
  const sections = await loadPreviewSections(session, bookId);
  const matter = options.matterOverride ?? (await loadBookMatter(session, bookId, sections));

  // La tipografía de la plantilla prima sobre la del perfil: la plantilla
  // describe el estilo editorial y el perfil la geometría.
  const typography = edition?.template
    ? withTypographyDefaults(edition.template.config.typography)
    : withTypographyDefaults(profile.typography);

  // La misma métrica que usa el PDF: si las fuentes están disponibles, la
  // vista previa y el archivo salen con los mismos cortes de línea.
  const fuentes = await loadPdfFonts();
  const cover = await previewCover(session, bookId);
  const geometry = { ...geometryFromProfile(profile), physicalPageOffset: cover ? 1 : 0 };
  const compose = (front: readonly MatterLayout[], back: readonly MatterLayout[]): LayoutBlock[] =>
    bookToBlocks(sectionsForMatter(sections, matter), {
      dropCaps,
      frontMatter: front,
      backMatter: back,
    });

  // Primera pasada: materias sin páginas. Después se estabiliza el índice,
  // porque sus propias páginas desplazan el cuerpo que numera.
  const stabilized = stabilizeComposition({
    matter,
    geometry,
    typography,
    ...(fuentes?.measure ? { measure: fuentes.measure } : {}),
    compose,
  });
  const { composition: result, stability } = stabilized;
  const blocks = compose(stabilized.composedMatter.front, stabilized.composedMatter.back);

  // El encabezado de página lo define la plantilla. Si la plantilla no dice
  // nada, se usa el título de la sección, que es lo que hace el motor.
  const plantilla = edition?.template;
  const tituloLibro = await previewBookTitle(session, bookId);

  const resolvedPages = resolveRunningHeads(result.pages, plantilla?.config ?? null, tituloLibro);
  const pages: PreviewPage[] = resolvedPages.map((page) => {
    const interior = profile.mirrorMargins ? page.side === "recto" : true;
    const leftMm = interior ? profile.marginInnerMm + profile.gutterMm : profile.marginOuterMm;

    return {
      ...page,
      drawnLines: previewLineDrawings(
        page,
        result.textWidthMm,
        leftMm,
        fuentes?.measure,
        profile.marginTopMm,
      ),
    };
  });

  // La portada ocupa la primera página del archivo: el índice se desplaza
  // para que sus números apunten a la página física, igual que en el PDF.
  const coverShift = cover ? 1 : 0;

  // El índice que se enseña aquí es el mismo que llevarán los marcadores del
  // PDF exportado: una sola historia entre pantalla y archivo.
  const outline = outlineFromPages(result.pages, sections).map((item) => ({
    ...item,
    pageIndex: item.pageIndex + coverShift,
  }));

  return {
    pages,
    diagnostics: [...result.diagnostics, ...tocDiagnostics(stability)],
    toc: stability,
    profile,
    template: edition?.template ?? null,
    typography,
    outline,
    cover: cover
      ? { url: cover.url, alt: `Portada de ${tituloLibro || "el libro"}`, crop: cover.crop }
      : null,
    dropCaps,
    sectionCount: sections.length,
    wordCount: blocks.reduce((total, block) => total + (block.text.match(/\S+/gu)?.length ?? 0), 0),
    usingDefaultProfile: !edition?.profile,
    realMetrics: Boolean(fuentes),
  };
}
