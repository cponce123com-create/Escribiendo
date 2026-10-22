import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import {
  paginate,
  withTypographyDefaults,
  type LayoutDiagnostic,
  type LaidOutPage,
  type PageGeometry,
  type TypographyConfig,
} from "@escribiendo/editorial-engine";
import { bookToBlocks, isChapterType, seccionesExportables, type PreviewSection } from "./blocks";
import { resolveRunningHeads } from "./running-heads";
import { previewLineDrawings, type PreviewLineDrawing } from "./preview-drawing";
import { loadPdfFonts } from "@/lib/export/fonts";
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

export interface PreviewResult {
  pages: PreviewPage[];
  diagnostics: LayoutDiagnostic[];
  profile: LayoutProfileSummary;
  template: TemplateSummary | null;
  typography: TypographyConfig;
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
}

/** Secciones del libro con su contenido, en orden de lectura. */
export async function loadPreviewSections(
  session: SessionContext,
  bookId: string,
): Promise<PreviewSection[]> {
  const sections = await prisma.bookSection.findMany({
    where: {
      bookId,
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      content: true,
      parentId: true,
      startOnOddPage: true,
      pageBreakBefore: true,
      includeInExport: true,
    },
  });

  // Una sección excluida del libro no se compone: la vista previa tiene que
  // parecerse al PDF, que tampoco la incluye.
  return seccionesExportables(sections).map((section) => ({
    id: section.id,
    title: section.title,
    type: section.type,
    content: section.content,
    isChapter: isChapterType(section.type),
    startOnOddPage: section.startOnOddPage,
    pageBreakBefore: section.pageBreakBefore,
    includeInExport: section.includeInExport,
  }));
}

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

/**
 * Compone la vista previa de un libro.
 *
 * Devuelve `null` cuando el libro no tiene perfil de página: sin geometría
 * no hay maqueta que enseñar.
 */
export async function buildPreview(
  session: SessionContext,
  bookId: string,
): Promise<PreviewResult | null> {
  const edition = await getBookEdition(session, bookId);
  const profile = edition?.profile ?? (await getDefaultLayoutProfile(session));

  if (!profile) {
    return null;
  }

  const sections = await loadPreviewSections(session, bookId);
  const blocks = bookToBlocks(sections);

  // La tipografía de la plantilla prima sobre la del perfil: la plantilla
  // describe el estilo editorial y el perfil la geometría.
  const typography = edition?.template
    ? withTypographyDefaults(edition.template.config.typography)
    : withTypographyDefaults(profile.typography);

  // La misma métrica que usa el PDF: si las fuentes están disponibles, la
  // vista previa y el archivo salen con los mismos cortes de línea.
  const fuentes = await loadPdfFonts();
  const result = paginate(blocks, geometryFromProfile(profile), typography, fuentes?.measure);

  // El encabezado de página lo define la plantilla. Si la plantilla no dice
  // nada, se usa el título de la sección, que es lo que hace el motor.
  const plantilla = edition?.template;
  const tituloLibro =
    (
      await prisma.book.findFirst({
        where: { id: bookId, workspaceId: session.workspace.id },
        select: { title: true },
      })
    )?.title ?? "";

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

  return {
    pages,
    diagnostics: result.diagnostics,
    profile,
    template: edition?.template ?? null,
    typography,
    sectionCount: sections.length,
    wordCount: blocks.reduce((total, block) => total + (block.text.match(/\S+/gu)?.length ?? 0), 0),
    usingDefaultProfile: !edition?.profile,
    realMetrics: Boolean(fuentes),
  };
}
