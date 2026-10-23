import "server-only";
import { legalFieldsSchema, settingsRecord } from "./template-settings";
import type { LaidOutPage } from "@escribiendo/editorial-engine";
import {
  buildLegalPage,
  buildTocEntries,
  legalPageTemplates,
  type BuildTocOptions,
  type LegalPageInput,
  type LegalPageTemplate,
  type TocDepth,
  type TocGroup,
  type TocSource,
} from "@escribiendo/templates";
import type { SessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { sectionToBlocks } from "@/lib/layout/blocks";
import type { MatterLayout, PreviewSection } from "@/lib/layout/blocks";
import { legalPageToBlocks, tocToBlocks } from "./matter-blocks";

/**
 * Materias editoriales del libro, listas para entrar en la maqueta.
 *
 * El índice y la página legal no se guardan como secciones: se derivan de los
 * datos de la obra y de la edición. Este módulo es el único lugar que decide
 * qué materias automáticas existen y cómo se componen, de modo que la vista
 * previa y el PDF exportado impriman exactamente lo mismo.
 */

export interface BookMatter {
  /** Solo para la galería: permite ver los bloques disponibles y sus avisos. */
  previewIncompleteLegal?: boolean;
  /** Secciones canónicas, en orden editorial. */
  tocSources: TocSource[];
  tocOptions: BuildTocOptions;
  /** Datos de la página legal; `null` si el libro no tiene título o autoría. */
  legal: LegalPageInput | null;
  legalMode: "print" | "digital";
  /** El manuscrito ya incluye una sección de índice. */
  hasTocSection: boolean;
  tocMode?: "AUTOMATIC" | "MANUAL" | "DISABLED";
  /** El manuscrito ya incluye una página de créditos. */
  hasCopyrightSection: boolean;
  legalPageMode?: "TEMPLATE" | "MANUAL" | "DISABLED";
  legalPageSectionId?: string | null;
  manualLegalLayout?: MatterLayout;
  legalTemplateVersion?: number;
  frozenLegal?: ReturnType<typeof buildLegalPage>;
}

export interface ComposedMatter {
  front: MatterLayout[];
  back: MatterLayout[];
  /** Firma estable para detectar si el índice cambió entre pasadas. */
  signature: string;
}

export const EMPTY_MATTER: ComposedMatter = { front: [], back: [], signature: "" };

const TOC_DEPTHS = [
  "parts-chapters",
  "chapters-h1",
  "chapters-h1-h2",
  "chapters-h1-h2-h3",
] as const satisfies readonly TocDepth[];

const FRONT_TYPES = new Set([
  "HALF_TITLE",
  "TITLE_PAGE",
  "COPYRIGHT",
  "DEDICATION",
  "EPIGRAPH",
  "TABLE_OF_CONTENTS",
  "FOREWORD",
  "PROLOGUE",
  "INTRODUCTION",
]);

const BACK_TYPES = new Set([
  "ACKNOWLEDGMENTS",
  "AUTHOR_NOTES",
  "ABOUT_AUTHOR",
  "BIBLIOGRAPHY",
  "GLOSSARY",
  "APPENDIX",
  "OTHER_BOOKS",
]);

const CONTRIBUTOR_LABELS: Record<string, string> = {
  AUTHOR: "Autoría",
  CO_AUTHOR: "Coautoría",
  EDITOR: "Edición",
  TRANSLATOR: "Traducción",
  ILLUSTRATOR: "Ilustración",
  PROLOGUE_AUTHOR: "Prólogo",
  CONTRIBUTOR: "Colaboración",
  OTHER: "Colaboración",
};

function tocLevel(type: string): number {
  const normalized = type.toUpperCase();

  if (normalized === "PART") {
    return 0;
  }

  if (normalized === "SUBCHAPTER") {
    return 2;
  }

  return 1;
}

function tocGroup(type: string): TocGroup {
  const normalized = type.toUpperCase();

  if (FRONT_TYPES.has(normalized)) {
    return "front";
  }

  if (BACK_TYPES.has(normalized)) {
    return "back";
  }

  return "body";
}

function tocDepthFrom(value: string | null | undefined): TocDepth {
  return (TOC_DEPTHS as readonly string[]).includes(value ?? "")
    ? (value as TocDepth)
    : "chapters-h1";
}

function settingString(settings: unknown, key: string): string | null {
  if (typeof settings !== "object" || settings === null) {
    return null;
  }

  const value = (settings as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

function legalTemplateFrom(value: string | null): LegalPageTemplate | null {
  return value !== null && (legalPageTemplates as readonly string[]).includes(value)
    ? (value as LegalPageTemplate)
    : null;
}

function contributorRoleLabel(role: string): string {
  return CONTRIBUTOR_LABELS[role] ?? "Colaboración";
}

/**
 * Folio impreso de la primera página de cada sección.
 *
 * Se toma el primer bloque de la sección, igual que los marcadores del PDF: la
 * página donde el lector encuentra de verdad el comienzo, no la última en la
 * que aparece una línea suelta. Se devuelve el folio y no el índice interno
 * porque el índice del libro debe anunciar el número que se imprime.
 */
export function pageFolioBySection(pages: readonly LaidOutPage[]): Map<string, number> {
  const map = new Map<string, number>();

  pages.forEach((page) => {
    for (const block of page.blocks) {
      if (!map.has(block.id)) map.set(block.id, page.folio);
      if (block.sectionId && block.firstOfSection && !map.has(block.sectionId)) {
        map.set(block.sectionId, page.folio);
      }
    }
  });

  return map;
}

/**
 * Carga los datos que alimentan las materias automáticas.
 *
 * Devuelve `null` cuando el libro no pertenece al espacio de trabajo: la
 * composición no debe inventar materias para un libro ajeno.
 */
export async function loadBookMatter(
  session: SessionContext,
  bookId: string,
  sections: readonly Pick<
    PreviewSection,
    "id" | "title" | "type" | "showInToc" | "includeInExport"
  >[] &
    readonly { content?: unknown }[],
): Promise<BookMatter | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: {
      title: true,
      subtitle: true,
      authorName: true,
      penName: true,
      language: true,
      editorialMetadata: true,
      contributors: {
        where: { visible: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { role: true, name: true, creditName: true },
      },
    },
  });

  if (!book) {
    return null;
  }

  const edition = await prisma.bookEdition.findFirst({
    where: { bookId, book: { workspaceId: session.workspace.id, deletedAt: null } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      format: true,
      settings: true,
      publicationDate: true,
      printedBy: true,
      printRun: true,
      legalDepositStatus: true,
      editorialPreset: true,
      tocDepth: true,
      tocIncludeFrontMatter: true,
      tocIncludeBackMatter: true,
      publisherProfile: {
        select: {
          name: true,
          imprint: true,
          legalName: true,
          taxId: true,
          contactEmail: true,
          website: true,
          address: true,
          city: true,
          country: true,
          logoUrl: true,
        },
      },
    },
  });

  const identifiers = await prisma.bookIdentifier.findMany({
    where: { bookId },
    select: { type: true, value: true, editionId: true },
  });

  const pickIdentifier = (type: "ISBN_13" | "ISBN_10" | "LEGAL_DEPOSIT"): string | null => {
    const preferred = identifiers.find(
      (identifier) => identifier.type === type && identifier.editionId === edition?.id,
    );
    const fallback = identifiers.find((identifier) => identifier.type === type);

    return (preferred ?? fallback)?.value ?? null;
  };

  const metadata = book.editorialMetadata;
  const publisher = edition?.publisherProfile ?? null;
  const author = book.penName?.trim() || book.authorName.trim();
  const title = book.title.trim();
  const legalTemplate =
    legalTemplateFrom(settingString(edition?.settings, "legalPageTemplate")) ??
    (metadata?.publicationCountry === "PE" || publisher?.country === "PE"
      ? "copyright-peru-author"
      : "copyright-international");

  const contributors = book.contributors.map((contributor) => ({
    role: contributorRoleLabel(contributor.role),
    name: contributor.creditName?.trim() || contributor.name.trim(),
  }));

  const legal: LegalPageInput | null =
    title.length === 0 || author.length === 0
      ? null
      : {
          template: legalTemplate,
          title,
          subtitle: book.subtitle,
          author,
          rightsHolder: metadata?.rightsHolder ?? author,
          copyrightYear:
            metadata?.publicationYear ?? edition?.publicationDate?.getUTCFullYear() ?? null,
          editionNumber: metadata?.editionNumber ?? null,
          editionLabel:
            metadata?.editionLabel ??
            (metadata?.editionNumber ? `${metadata.editionNumber}.ª ed.` : null),
          publicationDate: edition?.publicationDate ?? null,
          publicationCity: metadata?.publicationCity ?? publisher?.city ?? null,
          publicationCountry: metadata?.publicationCountry ?? publisher?.country ?? null,
          language: book.language,
          publisherName: publisher?.name ?? null,
          imprint: publisher?.imprint ?? null,
          legalPublisher: publisher?.legalName ?? null,
          taxId: publisher?.taxId ?? null,
          address: publisher?.address ?? null,
          contactEmail: publisher?.contactEmail ?? null,
          website: publisher?.website ?? null,
          isbn: pickIdentifier("ISBN_13") ?? pickIdentifier("ISBN_10"),
          legalDeposit: pickIdentifier("LEGAL_DEPOSIT"),
          legalDepositStatus: edition?.legalDepositStatus ?? null,
          printer: edition?.printedBy ?? null,
          printRun: edition?.printRun ?? null,
          contributors,
          imageCredits: metadata?.imageRightsHolder ?? null,
          logoUrl: publisher?.logoUrl ?? null,
          customClauses: Array.isArray(settingsRecord(edition?.settings).legalPageClauses)
            ? (settingsRecord(edition?.settings).legalPageClauses as string[])
            : [],
          formatLabel: edition?.format ?? null,
        };

  const fields = legalFieldsSchema.safeParse(
    settingsRecord(edition?.settings).legalPageFields ?? {},
  );
  if (legal && fields.success) Object.assign(legal, fields.data);
  const license = settingsRecord(edition?.settings).legalPageLicense;
  if (
    legal &&
    typeof license === "string" &&
    ["cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-nd", "cc0"].includes(license)
  )
    legal.license = license as LegalPageInput["license"];
  const rows = await prisma.editorialMatter.findMany({
    where: {
      bookId,
      kind: "COPYRIGHT",
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const legalRow =
    rows.find((row) => settingsRecord(row.data).editionId === edition?.id) ??
    rows.find((row) => !settingsRecord(row.data).editionId);
  const mode =
    settingString(edition?.settings, "legalPageMode") ??
    (legalRow?.enabled === false ? "DISABLED" : legalRow?.mode);
  const manualId = settingString(edition?.settings, "legalPageSectionId") ?? legalRow?.sectionId;
  let manualLegalLayout: MatterLayout | undefined;
  if (mode === "MANUAL" && manualId) {
    const section = await prisma.bookSection.findFirst({
      where: {
        id: manualId,
        bookId,
        deletedAt: null,
        book: { workspaceId: session.workspace.id, deletedAt: null },
      },
      select: { id: true, title: true, type: true, content: true },
    });
    if (section) {
      const blocks = sectionToBlocks({
        ...section,
        isChapter: false,
        startOnOddPage: false,
        pageBreakBefore: true,
        includeInExport: true,
        showInToc: false,
        showTitle: false,
        showSectionType: false,
        showSectionNumber: false,
      });
      manualLegalLayout = {
        id: section.id,
        blocks: blocks.map((block, index) => ({
          ...block,
          sectionId: section.id,
          firstOfSection: index === 0,
          breaksBefore: index === 0,
        })),
      };
    }
  }
  const tocSources: TocSource[] = sections.map((section) => ({
    id: section.id,
    title: section.title,
    level: tocLevel(section.type),
    group: tocGroup(section.type),
    showInToc:
      section.showInToc && section.type !== "TABLE_OF_CONTENTS" && section.type !== "COPYRIGHT",
    includeInExport: section.includeInExport,
    enabled: true,
  }));

  // Los encabezados usan ids de bloque reales; el folio se obtiene de la composición.
  sections.forEach((section) => {
    if (!section.content || section.type === "TABLE_OF_CONTENTS" || section.type === "COPYRIGHT")
      return;
    const blocks = sectionToBlocks({
      ...section,
      content: section.content,
      isChapter: false,
      startOnOddPage: false,
      pageBreakBefore: false,
      showTitle: true,
      showSectionType: false,
      showSectionNumber: false,
    });
    const sourceIndex = tocSources.findIndex((source) => source.id === section.id);
    const headings = blocks
      .filter((block) => ["heading1", "heading2", "heading3"].includes(block.kind))
      .map((block) => ({
        id: block.id,
        title: block.text,
        level: Number(block.kind.at(-1)) + 1,
        headingLevel: Number(block.kind.at(-1)),
        group: tocGroup(section.type),
        showInToc: section.showInToc,
        includeInExport: section.includeInExport,
      }));
    tocSources.splice(sourceIndex + 1, 0, ...headings);
  });
  const tocRows = await prisma.editorialMatter.findMany({
    where: {
      bookId,
      kind: "TABLE_OF_CONTENTS",
      deletedAt: null,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const tocRow =
    tocRows.find((row) => settingsRecord(row.data).editionId === edition?.id) ??
    tocRows.find((row) => !settingsRecord(row.data).editionId);
  return {
    tocMode:
      tocRow?.mode === "MANUAL"
        ? "MANUAL"
        : tocRow?.mode === "DISABLED" || tocRow?.enabled === false
          ? "DISABLED"
          : "AUTOMATIC",
    tocSources,
    tocOptions: {
      depth: tocDepthFrom(edition?.tocDepth ?? settingString(edition?.settings, "tocDepth")),
      includeFrontMatter: edition?.tocIncludeFrontMatter ?? true,
      includeBackMatter: edition?.tocIncludeBackMatter ?? true,
      skipEmptyTitles: true,
    },
    legal,
    legalPageMode:
      mode === "MANUAL" || mode === "DISABLED"
        ? mode
        : mode === "TEMPLATE"
          ? "TEMPLATE"
          : undefined,
    legalPageSectionId: manualId,
    ...(manualLegalLayout ? { manualLegalLayout } : {}),
    legalTemplateVersion:
      typeof settingsRecord(edition?.settings).legalPageTemplateVersion === "number"
        ? (settingsRecord(edition?.settings).legalPageTemplateVersion as number)
        : undefined,
    legalMode: legalTemplate === "copyright-digital" ? "digital" : "print",
    hasTocSection: sections.some((section) => section.type.toUpperCase() === "TABLE_OF_CONTENTS"),
    hasCopyrightSection: sections.some((section) => section.type.toUpperCase() === "COPYRIGHT"),
  };
}

/**
 * Compone las materias automáticas con las páginas ya calculadas.
 *
 * El índice se recalcula en cada pasada: sus propios números pueden mover el
 * cuerpo y, con él, las páginas que anuncia. Las materias que el manuscrito ya
 * trae como sección no se duplican.
 */
export function composeMatter(
  matter: BookMatter,
  pageBySection: ReadonlyMap<string, number>,
): ComposedMatter {
  const front: MatterLayout[] = [];
  if (matter.legalPageMode === "MANUAL" && matter.manualLegalLayout)
    front.push(matter.manualLegalLayout);

  if (
    matter.legalPageMode !== "DISABLED" &&
    matter.legalPageMode !== "MANUAL" &&
    (!matter.hasCopyrightSection || matter.legalPageMode === "TEMPLATE") &&
    matter.legal
  ) {
    const composed = matter.frozenLegal ?? buildLegalPage(matter.legal, { mode: matter.legalMode });
    const blocks = legalPageToBlocks(
      matter.previewIncompleteLegal ? { ...composed, ready: true } : composed,
      {
        id: "matter-copyright",
        sectionTitle: "Créditos",
        pageBreakBefore: true,
      },
    );

    if (blocks.length > 0) {
      front.push({ id: "matter-copyright", blocks });
    }
  }

  if (matter.tocMode !== "MANUAL" && matter.tocMode !== "DISABLED") {
    const entries = buildTocEntries(
      matter.tocSources.map((source) => {
        const folio = pageBySection.get(source.id);

        return { ...source, pageLabel: folio === undefined ? null : String(folio) };
      }),
      matter.tocOptions,
    );
    const blocks = tocToBlocks(entries, {
      id: "matter-toc",
      heading: "Índice",
      pageBreakBefore: true,
      widthChars: 58,
    });

    if (entries.length > 0) {
      front.push({ id: "matter-toc", blocks });
    }
  }

  return {
    front,
    back: [],
    signature: front
      .flatMap((matterLayout) => matterLayout.blocks.map((block) => block.text))
      .join("|"),
  };
}

/** Excluye únicamente las materias sustituidas de la composición, nunca del manuscrito. */
export function sectionsForMatter<T extends { id: string; type: string }>(
  sections: readonly T[],
  matter: BookMatter | null,
): T[] {
  if (!matter) return [...sections];
  return sections.filter((section) => {
    if (matter.legalPageMode && section.type === "COPYRIGHT") return false;
    if (matter.legalPageMode === "MANUAL" && section.id === matter.legalPageSectionId) return false;
    return true;
  });
}
