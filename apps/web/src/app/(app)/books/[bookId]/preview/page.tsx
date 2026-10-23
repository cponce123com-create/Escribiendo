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
  searchParams: Promise<{ dropCaps?: string | string[] }>;
}

export default async function BookPreviewPage({ params, searchParams }: BookPreviewPageProps) {
  const session = await requireSession();
  const { bookId } = await params;
  const { dropCaps: dropCapsParam } = await searchParams;
  const dropCaps =
    (Array.isArray(dropCapsParam) ? dropCapsParam[0] : dropCapsParam) === "true";

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const preview = await buildPreview(session, book.id, { dropCaps });

  if (!preview) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-serif text-3xl text-ink">Todavía no hay maqueta</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Para ver la vista previa paginada hace falta elegir una plantilla en la maquetación. La
          plantilla define el tamaño de la hoja, los márgenes y la tipografía.
        </p>
        <Link className="btn btn-secondary" href={`/books/${book.id}/layout`}>
          Ir a la maquetación
        </Link>
      </div>
    );
  }

  const { pages, diagnostics, profile, template } = preview;
  const pageCount = pages.length + (preview.cover ? 1 : 0);

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
          {pageCount} {pageCount === 1 ? "página" : "páginas"}
          {preview.cover ? " (portada incluida)" : ""}
          {template ? ` con la plantilla «${template.name}»` : ` con el perfil «${profile.name}»`} (
          {profile.pageWidthMm} × {profile.pageHeightMm} mm) y {formatNumber(preview.wordCount)}{" "}
          palabras en {preview.sectionCount} {preview.sectionCount === 1 ? "sección" : "secciones"}.
        </p>
        <p className="max-w-2xl text-xs leading-relaxed text-ink-muted">
          {preview.realMetrics
            ? "La composición usa las métricas reales de la fuente que se incrusta en el PDF: los cortes de línea de esta vista previa son los mismos que los del archivo exportado."
            : "La composición se estima con un modelo de anchos medios de carácter, porque no se han podido cargar las fuentes: sirve para ver la estructura y detectar problemas, pero la paginación definitiva se calcula al exportar."}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-muted">Inicial capitular:</span>
          <Link
            className={dropCaps ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
            href={`/books/${book.id}/preview`}
            aria-current={dropCaps ? undefined : "page"}
          >
            Sin inicial
          </Link>
          <Link
            className={dropCaps ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            href={`/books/${book.id}/preview?dropCaps=true`}
            aria-current={dropCaps ? "page" : undefined}
          >
            Con inicial
          </Link>
        </div>
      </header>

      <section className="panel p-6" aria-label="diagnóstico de composición">
        <p className="meta-label">Diagnóstico</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Problemas de composición</h2>
        <div className="mt-5">
          <DiagnosticsPanel diagnostics={diagnostics} />
        </div>
      </section>

      {preview.outline.length > 0 ? (
        <section className="panel p-6" aria-label="índice">
          <p className="meta-label">Índice</p>
          <h2 className="mt-1.5 font-serif text-2xl text-ink">Secciones del libro</h2>
          <ol className="mt-5 space-y-2 text-sm text-ink-soft">
            {preview.outline.map((item) => (
              <li key={`${item.pageIndex}-${item.title}`} className="flex gap-4">
                <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-muted">
                  {item.pageIndex + 1}
                </span>
                <span>{item.title}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Los números remiten a la página física de esta vista previa
            {preview.cover ? ", contando la portada" : ""}. El PDF exportado lleva los mismos
            marcadores y el EPUB reproduce esta jerarquía en su índice.
          </p>
        </section>
      ) : null}

      <section aria-label="páginas">
        <PaginatedPreview
          pages={pages}
          profile={profile}
          typography={preview.typography}
          cover={preview.cover}
        />
      </section>
    </div>
  );
}
