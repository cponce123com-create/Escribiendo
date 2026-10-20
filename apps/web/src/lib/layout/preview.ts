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
import { bookToBlocks, isChapterType, type PreviewSection } from "./blocks";
import { getBookEdition, getDefaultLayoutProfile, type LayoutProfileSummary } from "./profiles";

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
}

export interface PreviewResult {
  pages: PreviewPage[];
  diagnostics: LayoutDiagnostic[];
  profile: LayoutProfileSummary;
  typography: TypographyConfig;
  /** Secciones que se han compuesto. */
  sectionCount: number;
  /** Palabras del manuscrito. */
  wordCount: number;
  /** Si no hay edición, se ha usado el perfil predeterminado del estudio. */
  usingDefaultProfile: boolean;
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
    },
  });

  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    type: section.type,
    content: section.content,
    isChapter: isChapterType(section.type),
    startOnOddPage: section.startOnOddPage,
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

  const result = paginate(blocks, geometryFromProfile(profile), typography);

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

  const pages: PreviewPage[] = result.pages.map((page) => {
    const seccion = page.blocks[0]?.sectionTitle ?? "";
    const texto = plantilla
      ? page.side === "recto"
        ? plantilla.config.runningHead.recto
        : plantilla.config.runningHead.verso
      : "";

    if (!texto) {
      return { ...page, runningHead: page.runningHead };
    }

    return {
      ...page,
      runningHead: texto
        .replaceAll("{libro}", tituloLibro)
        .replaceAll("{capitulo}", seccion)
        .trim(),
    };
  });

  return {
    pages,
    diagnostics: result.diagnostics,
    profile,
    typography,
    sectionCount: sections.length,
    wordCount: blocks.reduce((total, block) => total + (block.text.match(/\S+/gu)?.length ?? 0), 0),
    usingDefaultProfile: !edition?.profile,
  };
}
