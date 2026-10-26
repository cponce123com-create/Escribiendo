import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { BookFormat } from "@escribiendo/database";
import { withTypographyDefaults, type TypographyConfig } from "@escribiendo/editorial-engine";
import {
  SYSTEM_TEMPLATES,
  templatePagePreset,
  withTemplateDefaults,
  type EditorialTemplateConfig,
  type TemplatePagePreset,
} from "@escribiendo/templates";

/**
 * Perfiles de página, plantillas editoriales y ediciones.
 *
 * Un perfil de página describe la geometría (tamaño, márgenes, sangrado) y
 * la tipografía. Una plantilla editorial describe los estilos. Una edición
 * es la unión de ambos para un libro concreto.
 */

export interface LayoutProfileSummary {
  id: string;
  name: string;
  format: BookFormat;
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
  isDefault: boolean;
  typography: TypographyConfig;
  /** Número de ediciones que usan este perfil. */
  usedBy: number;
}

export interface TemplateSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  config: EditorialTemplateConfig;
  /** Geometría predeterminada que la aplicación deriva al aplicar la plantilla. */
  page: TemplatePagePreset;
}

export interface EditionSummary {
  tocDepth: string | null;
  tocIncludeFrontMatter: boolean;
  tocIncludeBackMatter: boolean;
  id: string;
  bookId: string;
  name: string;
  format: BookFormat;
  isDefault: boolean;
  pageCount: number | null;
  settings: unknown;
  profile: LayoutProfileSummary | null;
  template: TemplateSummary | null;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapProfile(profile: {
  id: string;
  name: string;
  format: BookFormat;
  pageWidthMm: unknown;
  pageHeightMm: unknown;
  marginTopMm: unknown;
  marginBottomMm: unknown;
  marginInnerMm: unknown;
  marginOuterMm: unknown;
  gutterMm: unknown;
  bleedMm: unknown;
  headerDistanceMm: unknown;
  footerDistanceMm: unknown;
  mirrorMargins: boolean;
  showPageNumbers: boolean;
  chapterStartsRecto: boolean;
  isDefault: boolean;
  typographyConfig: unknown;
  _count?: { editions: number };
}): LayoutProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    format: profile.format,
    pageWidthMm: toNumber(profile.pageWidthMm),
    pageHeightMm: toNumber(profile.pageHeightMm),
    marginTopMm: toNumber(profile.marginTopMm),
    marginBottomMm: toNumber(profile.marginBottomMm),
    marginInnerMm: toNumber(profile.marginInnerMm),
    marginOuterMm: toNumber(profile.marginOuterMm),
    gutterMm: toNumber(profile.gutterMm),
    bleedMm: toNumber(profile.bleedMm),
    headerDistanceMm: toNumber(profile.headerDistanceMm),
    footerDistanceMm: toNumber(profile.footerDistanceMm),
    mirrorMargins: profile.mirrorMargins,
    showPageNumbers: profile.showPageNumbers,
    chapterStartsRecto: profile.chapterStartsRecto,
    isDefault: profile.isDefault,
    typography: withTypographyDefaults(profile.typographyConfig),
    usedBy: profile._count?.editions ?? 0,
  };
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  format: true,
  pageWidthMm: true,
  pageHeightMm: true,
  marginTopMm: true,
  marginBottomMm: true,
  marginInnerMm: true,
  marginOuterMm: true,
  gutterMm: true,
  bleedMm: true,
  headerDistanceMm: true,
  footerDistanceMm: true,
  mirrorMargins: true,
  showPageNumbers: true,
  chapterStartsRecto: true,
  isDefault: true,
  typographyConfig: true,
  _count: { select: { editions: true } },
} as const;

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isSystem: true,
  config: true,
} as const;

const SYSTEM_TEMPLATE_ORDER = new Map(
  SYSTEM_TEMPLATES.map((template, index) => [template.slug, index]),
);

function mapTemplate(template: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  config: unknown;
}): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    isSystem: template.isSystem,
    config: withTemplateDefaults(template.config),
    page: templatePagePreset(template.slug, template.isSystem),
  };
}

/**
 * Orden de presentación: primero las plantillas de sistema en el orden del
 * catálogo (Novela, Ensayo, Poesía, Manual) y después las propias por nombre.
 */
function compareTemplates(a: TemplateSummary, b: TemplateSummary): number {
  if (a.isSystem !== b.isSystem) {
    return a.isSystem ? -1 : 1;
  }

  if (a.isSystem) {
    const aOrder = SYSTEM_TEMPLATE_ORDER.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = SYSTEM_TEMPLATE_ORDER.get(b.slug) ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
  }

  return a.name.localeCompare(b.name, "es");
}

/** Perfiles de página del espacio de trabajo. */
export async function listLayoutProfiles(session: SessionContext): Promise<LayoutProfileSummary[]> {
  const profiles = await prisma.layoutProfile.findMany({
    where: { workspaceId: session.workspace.id, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: PROFILE_SELECT,
  });

  return profiles.map(mapProfile);
}

/** Un perfil de página del espacio de trabajo. */
export async function getLayoutProfile(
  session: SessionContext,
  profileId: string,
): Promise<LayoutProfileSummary | null> {
  const profile = await prisma.layoutProfile.findFirst({
    where: { id: profileId, workspaceId: session.workspace.id, deletedAt: null },
    select: PROFILE_SELECT,
  });

  return profile ? mapProfile(profile) : null;
}

/** El perfil predeterminado del espacio de trabajo, si lo hay. */
export async function getDefaultLayoutProfile(
  session: SessionContext,
): Promise<LayoutProfileSummary | null> {
  const profile = await prisma.layoutProfile.findFirst({
    where: { workspaceId: session.workspace.id, deletedAt: null, isDefault: true },
    select: PROFILE_SELECT,
  });

  return profile ? mapProfile(profile) : null;
}

/** Plantillas de sistema y propias del espacio de trabajo. */
export async function listTemplates(session: SessionContext): Promise<TemplateSummary[]> {
  const templates = await prisma.editorialTemplate.findMany({
    where: {
      deletedAt: null,
      OR: [{ workspaceId: null }, { workspaceId: session.workspace.id }],
    },
    select: TEMPLATE_SELECT,
  });

  return templates.map(mapTemplate).sort(compareTemplates);
}

/** Una plantilla por su identificador, sea de sistema o del espacio. */
export async function getTemplate(
  session: SessionContext,
  templateId: string,
): Promise<TemplateSummary | null> {
  const template = await prisma.editorialTemplate.findFirst({
    where: {
      id: templateId,
      deletedAt: null,
      OR: [{ workspaceId: null }, { workspaceId: session.workspace.id }],
    },
    select: TEMPLATE_SELECT,
  });

  return template ? mapTemplate(template) : null;
}

/** La edición por defecto de un libro. */
export async function getBookEdition(
  session: SessionContext,
  bookId: string,
): Promise<EditionSummary | null> {
  const edition = await prisma.bookEdition.findFirst({
    where: { bookId, book: { workspaceId: session.workspace.id, deletedAt: null } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      bookId: true,
      name: true,
      format: true,
      isDefault: true,
      pageCount: true,
      settings: true,
      tocDepth: true,
      tocIncludeFrontMatter: true,
      tocIncludeBackMatter: true,
      layoutProfile: { select: PROFILE_SELECT },
      editorialTemplate: { select: TEMPLATE_SELECT },
    },
  });

  if (!edition) {
    return null;
  }

  return {
    id: edition.id,
    bookId: edition.bookId,
    name: edition.name,
    format: edition.format,
    isDefault: edition.isDefault,
    pageCount: edition.pageCount,
    settings: edition.settings,
    tocDepth: edition.tocDepth,
    tocIncludeFrontMatter: edition.tocIncludeFrontMatter,
    tocIncludeBackMatter: edition.tocIncludeBackMatter,
    profile: edition.layoutProfile ? mapProfile(edition.layoutProfile) : null,
    template: edition.editorialTemplate ? mapTemplate(edition.editorialTemplate) : null,
  };
}

const TEMPLATE_PROFILE_PREFIX = "Plantilla: ";

/** Nombre determinista del perfil que acompaña a una plantilla. */
export function templateProfileName(templateName: string): string {
  return `${TEMPLATE_PROFILE_PREFIX}${templateName}`.slice(0, 160);
}

export interface EnsuredTemplateProfile {
  id: string;
  name: string;
  format: BookFormat;
}

/**
 * Crea o actualiza el perfil de página que acompaña a una plantilla.
 *
 * La plantilla es la única elección del flujo principal. Este perfil existe
 * para que la vista previa y la exportación sigan teniendo una geometría
 * persistida; se deriva de la plantilla y no se pide a mano. Si el perfil ya
 * existía, se vuelve a sincronizar con el preset: aplicar una plantilla
 * devuelve la maqueta a sus valores predeterminados.
 */
export async function ensureTemplateProfile(
  session: SessionContext,
  template: TemplateSummary,
): Promise<EnsuredTemplateProfile> {
  const name = templateProfileName(template.name);
  const page = {
    format: template.page.format as BookFormat,
    pageWidthMm: template.page.pageWidthMm,
    pageHeightMm: template.page.pageHeightMm,
    marginTopMm: template.page.marginTopMm,
    marginBottomMm: template.page.marginBottomMm,
    marginInnerMm: template.page.marginInnerMm,
    marginOuterMm: template.page.marginOuterMm,
    gutterMm: template.page.gutterMm,
    bleedMm: template.page.bleedMm,
    headerDistanceMm: template.page.headerDistanceMm,
    footerDistanceMm: template.page.footerDistanceMm,
    mirrorMargins: template.page.mirrorMargins,
    showPageNumbers: template.page.showPageNumbers,
    chapterStartsRecto: template.page.chapterStartsRecto,
    typographyConfig: template.config.typography,
  };

  return prisma.layoutProfile.upsert({
    where: {
      workspaceId_name: {
        workspaceId: session.workspace.id,
        name,
      },
    },
    create: {
      workspaceId: session.workspace.id,
      name,
      ...page,
    },
    update: {
      ...page,
      deletedAt: null,
    },
    select: { id: true, name: true, format: true },
  });
}
