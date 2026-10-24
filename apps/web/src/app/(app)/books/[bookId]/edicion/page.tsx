import { z } from "zod";
import {
  DEFAULT_DEDICATION_SETTINGS,
  DEFAULT_DROP_CAP_SETTINGS,
  LEGAL_FIELD_LABELS,
} from "@/lib/editorial/template-settings";
import { DedicationSettings } from "@/components/layout/dedication-settings";
import { DropCapSettingsForm } from "@/components/layout/drop-cap-settings";
import { sectionToBlocks } from "@/lib/layout/blocks";
import { TocTemplateGallery } from "@/components/layout/toc-template-gallery";
import { buildTocPreview } from "@/lib/editorial/toc-preview";
import {
  TOC_TEMPLATE_CATALOG,
  tocParametersFrom,
  auditEditorialStructure,
  resolveEditorialStructure,
} from "@escribiendo/templates";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getBook, getSection } from "@/lib/books/queries";
import { canPerform } from "@/lib/books/permissions";
import { loadBookMatter } from "@/lib/editorial/book-matter";
import { buildLegalMatterPreview, loadPreviewSections } from "@/lib/layout/preview";
import { LEGAL_TEMPLATE_CATALOG, buildLegalPage } from "@escribiendo/templates";
import { LegalTemplateGallery } from "@/components/layout/legal-template-gallery";

export default async function EditionMatterPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ legacySection?: string }>;
}) {
  const { bookId } = await params;
  const { legacySection } = await searchParams;
  const session = await requireSession();
  const book = await getBook(session, bookId);
  if (!book) notFound();
  const legacyId = z.string().uuid().safeParse(legacySection);
  const legacy = legacyId.success ? await getSection(session, bookId, legacyId.data) : null;
  const legacyMatter =
    legacy && (legacy.type === "COPYRIGHT" || legacy.type === "TABLE_OF_CONTENTS") ? legacy : null;
  const sections = await loadPreviewSections(session, bookId);
  const matter = await loadBookMatter(session, bookId, sections);
  const dedicationSection =
    sections.find((section) => section.type.toUpperCase() === "DEDICATION") ?? null;
  const dedicationText = dedicationSection
    ? sectionToBlocks(dedicationSection)
        .map((block) => block.text.trim())
        .filter(Boolean)
        .join("\n\n")
    : "";
  const dropCapChapters = sections
    .filter((section) => section.isChapter && section.type.toUpperCase() !== "SUBCHAPTER")
    .map((section) => ({ id: section.id, title: section.title }));
  const manuscriptSection = sections.find(
    (section) => section.type !== "COPYRIGHT" && section.type !== "TABLE_OF_CONTENTS",
  );
  const selectedLegalTemplate = matter?.legal?.template ?? "copyright-international";
  const cards = await Promise.all(
    LEGAL_TEMPLATE_CATALOG.map(async (item) => {
      const legal = matter?.legal ? { ...matter.legal, template: item.slug } : null;
      const result = legal ? buildLegalPage(legal) : null;
      // Solo la plantilla elegida se compone con los datos del libro. El resto
      // muestra una miniatura de catálogo hasta que el editor la seleccione:
      // entrar en la página no dispara una composición por tarjeta.
      const preview =
        legal && item.slug === selectedLegalTemplate
          ? await buildLegalMatterPreview(session, bookId, legal, matter?.legalMode ?? "print")
          : null;
      return { slug: item.slug, preview, warnings: result?.warnings ?? [] };
    }),
  );
  const tocParameters = {
    ...(matter?.tocParameters ?? tocParametersFrom({})),
    tocDepth: matter?.tocOptions.depth ?? "chapters-h1",
    tocIncludeFrontMatter: matter?.tocOptions.includeFrontMatter ?? true,
    tocIncludeBackMatter: matter?.tocOptions.includeBackMatter ?? true,
  };
  const tocCards = await Promise.all(
    TOC_TEMPLATE_CATALOG.map(async (item) => ({
      slug: item.slug,
      // El índice necesita los folios reales del cuerpo, así que se compone
      // solo el elegido; las demás tarjetas esperan a que se seleccionen.
      preview:
        item.slug === tocParameters.tocTemplate
          ? await buildTocPreview(session, bookId, tocParameters)
          : null,
    })),
  );
  const diagnostics = auditEditorialStructure(resolveEditorialStructure(), {
    hasBodySections: matter?.tocSources.some((source) => source.group === "body") ?? false,
    hasRightsHolder: Boolean(matter?.legal?.rightsHolder),
    hasIsbn: Boolean(matter?.legal?.isbn),
    hasPublicationYear: Boolean(matter?.legal?.copyrightYear),
  });
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-3">
        <Link href={`/books/${bookId}/layout`} className="text-sm underline">
          Volver a Maquetación
        </Link>
        <Link
          className="ml-4 text-sm underline"
          href={
            manuscriptSection
              ? `/books/${bookId}/sections/${manuscriptSection.id}`
              : `/books/${bookId}`
          }
        >
          Volver al manuscrito
        </Link>
        <h1 className="font-serif text-3xl">Páginas de la edición</h1>
        <p className="text-ink-soft">
          Elige con los datos reales de «{book.title}». La hoja usa la misma composición que la
          vista previa y el PDF.
        </p>
      </header>
      {legacyMatter ? (
        <aside className="alert space-y-2" role="status">
          <p>
            Has abierto la configuración de «{legacyMatter.title}». La galería sustituye al editor
            vacío para elegir plantillas. El contenido anterior sigue guardado.
          </p>
          <Link
            className="underline"
            href={`/books/${bookId}/sections/${legacyMatter.id}?editLegacy=1`}
          >
            Ver o editar contenido anterior
          </Link>
        </aside>
      ) : null}
      <TocTemplateGallery
        bookId={bookId}
        cards={tocCards}
        initial={tocParameters}
        canManage={canPerform(session.workspace.role, "layout:manage")}
        warning={diagnostics.find((item) => item.code === "INDICE_SIN_CUERPO")?.message ?? null}
        manual={matter?.tocMode === "MANUAL"}
      />
      <DropCapSettingsForm
        bookId={bookId}
        initial={matter?.dropCap ?? DEFAULT_DROP_CAP_SETTINGS}
        chapters={dropCapChapters}
        canManage={canPerform(session.workspace.role, "layout:manage")}
      />
      <DedicationSettings
        bookId={bookId}
        initial={matter?.dedication ?? DEFAULT_DEDICATION_SETTINGS}
        text={dedicationText}
        sectionId={dedicationSection?.id ?? null}
        canManage={canPerform(session.workspace.role, "layout:manage")}
      />
      <LegalTemplateGallery
        bookId={bookId}
        cards={cards}
        selected={matter?.legal?.template ?? "copyright-international"}
        clauses={matter?.legal?.customClauses?.join("\n") ?? ""}
        license={matter?.legal?.license ?? ""}
        country={matter?.legal?.publicationCountry ?? ""}
        publisher={Boolean(matter?.legal?.publisherName || matter?.legal?.imprint)}
        canManage={canPerform(session.workspace.role, "layout:manage")}
        mode={matter?.legalPageMode ?? "TEMPLATE"}
        sectionId={matter?.legalPageSectionId ?? ""}
        fields={Object.fromEntries(
          Object.keys(LEGAL_FIELD_LABELS).map((key) => [
            key,
            (matter?.legal as unknown as Record<string, string | number | null> | null)?.[key] ??
              (key === "copyrightYear" || key === "printRun" ? null : ""),
          ]),
        )}
        sections={sections
          .filter((section) => section.type === "CUSTOM" || section.type === "COPYRIGHT")
          .map((section) => ({ id: section.id, title: section.title }))}
      />
    </div>
  );
}
