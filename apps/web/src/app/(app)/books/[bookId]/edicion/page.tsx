import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getBook } from "@/lib/books/queries";
import { canPerform } from "@/lib/books/permissions";
import { loadBookMatter } from "@/lib/editorial/book-matter";
import { buildPreview, loadPreviewSections } from "@/lib/layout/preview";
import { LEGAL_TEMPLATE_CATALOG, buildLegalPage } from "@escribiendo/templates";
import { LegalTemplateGallery } from "@/components/layout/legal-template-gallery";

export default async function EditionMatterPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const session = await requireSession();
  const book = await getBook(session, bookId);
  if (!book) notFound();
  const sections = await loadPreviewSections(session, bookId);
  const matter = await loadBookMatter(session, bookId, sections);
  const cards = await Promise.all(
    LEGAL_TEMPLATE_CATALOG.map(async (item) => {
      const legal = matter?.legal ? { ...matter.legal, template: item.slug } : null;
      const result = legal ? buildLegalPage(legal) : null;
      const preview =
        legal && matter
          ? await buildPreview(session, bookId, {
              matterOverride: {
                ...matter,
                legal,
                hasCopyrightSection: false,
                previewIncompleteLegal: true,
              },
            })
          : null;
      return {
        slug: item.slug,
        preview: preview
          ? {
              ...preview,
              cover: null,
              pages: preview.pages.filter((page) =>
                page.blocks.some((block) => block.sectionId === "matter-copyright"),
              ),
            }
          : null,
        warnings: result?.warnings ?? [],
      };
    }),
  );
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-3">
        <Link href={`/books/${bookId}/layout`} className="text-sm underline">
          Volver a Maquetación
        </Link>
        <h1 className="font-serif text-3xl">Páginas de la edición</h1>
        <p className="text-ink-soft">
          Elige con los datos reales de «{book.title}». La hoja usa la misma composición que la
          vista previa y el PDF.
        </p>
      </header>
      <LegalTemplateGallery
        bookId={bookId}
        cards={cards}
        selected={matter?.legal?.template ?? "copyright-international"}
        clauses={matter?.legal?.customClauses?.join("\n") ?? ""}
        license={matter?.legal?.license ?? ""}
        country={matter?.legal?.publicationCountry ?? ""}
        publisher={Boolean(matter?.legal?.publisherName || matter?.legal?.imprint)}
        canManage={canPerform(session.workspace.role, "layout:manage")}
        sections={sections.map((section) => ({ id: section.id, title: section.title }))}
      />
    </div>
  );
}
