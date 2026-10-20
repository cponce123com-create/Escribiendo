import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { BookFormat } from "@escribiendo/database";
import { withTypographyDefaults, type TypographyConfig } from "@escribiendo/editorial-engine";
import { withTemplateDefaults, type EditorialTemplateConfig } from "@escribiendo/templates";

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
}

export interface EditionSummary {
  id: string;
  bookId: string;
  name: string;
  format: BookFormat;
  isDefault: boolean;
  pageCount: number | null;
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
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, isSystem: true, config: true },
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    isSystem: template.isSystem,
    config: withTemplateDefaults(template.config),
  }));
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
    select: { id: true, name: true, slug: true, description: true, isSystem: true, config: true },
  });

  if (!template) {
    return null;
  }

  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    isSystem: template.isSystem,
    config: withTemplateDefaults(template.config),
  };
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
      layoutProfile: { select: PROFILE_SELECT },
      editorialTemplate: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isSystem: true,
          config: true,
        },
      },
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
    profile: edition.layoutProfile ? mapProfile(edition.layoutProfile) : null,
    template: edition.editorialTemplate
      ? {
          id: edition.editorialTemplate.id,
          name: edition.editorialTemplate.name,
          slug: edition.editorialTemplate.slug,
          description: edition.editorialTemplate.description,
          isSystem: edition.editorialTemplate.isSystem,
          config: withTemplateDefaults(edition.editorialTemplate.config),
        }
      : null,
  };
}
