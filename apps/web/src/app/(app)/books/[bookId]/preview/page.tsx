import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiagnosticsPanel } from "@/components/layout/diagnostics-panel";
import { PaginatedPreview } from "@/components/layout/paginated-preview";
import { requireSession } from "@/lib/auth/session";
import { getBook } from "@/lib/books/queries";
import { buildPreview } from "@/lib/layout/preview";
import { formatNumber } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Vista previa paginada",
};

interface BookPreviewPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function BookPreviewPage({ params }: BookPreviewPageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const preview = await buildPreview(session, book.id);

  if (!preview) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-serif text-3xl text-ink">Todavía no hay maqueta</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Para ver la vista previa paginada hace falta un perfil de página: define el tamaño de la
          hoja, los márgenes y el sangrado.
        </p>
        <Link className="btn btn-secondary" href={`/books/${book.id}/layout`}>
          Ir a la maquetación
        </Link>
      </div>
    );
  }

  const { pages, diagnostics, profile } = preview;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}`}>
            {book.title}
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Vista previa paginada
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          {pages.length} {pages.length === 1 ? "página" : "páginas"} con el perfil «{profile.name}»
          ({profile.pageWidthMm} × {profile.pageHeightMm} mm) y {formatNumber(preview.wordCount)}{" "}
          palabras en {preview.sectionCount} {preview.sectionCount === 1 ? "sección" : "secciones"}.
        </p>
        <p className="max-w-2xl text-xs leading-relaxed text-ink-muted">
          La composición se estima con un modelo de anchos medios de carácter, no con las métricas
          reales de la fuente: sirve para ver la estructura y detectar problemas, pero la paginación
          definitiva se calcula al exportar.
        </p>
      </header>

      <section className="panel p-6" aria-label="diagnóstico de composición">
        <p className="meta-label">Diagnóstico</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Problemas de composición</h2>
        <div className="mt-5">
          <DiagnosticsPanel diagnostics={diagnostics} />
        </div>
      </section>

      <section aria-label="páginas">
        <PaginatedPreview pages={pages} profile={profile} typography={preview.typography} />
      </section>
    </div>
  );
}
