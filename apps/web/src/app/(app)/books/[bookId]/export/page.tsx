import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExportPanel } from "@/components/export/export-panel";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";
import { getBookEdition } from "@/lib/layout/profiles";
import { listExportJobs } from "@/lib/export/jobs";
import { formatDateTime } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Exportación",
};

interface BookExportPageProps {
  params: Promise<{ bookId: string }>;
}

const FORMAT_LABELS: Record<string, string> = {
  PDF_DIGITAL: "PDF digital",
  PDF_PRINT: "PDF de imprenta",
  EPUB3: "EPUB 3",
  DOCX: "DOCX",
  MARKDOWN: "Markdown",
  HTML: "HTML",
  TXT: "Texto plano",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "En proceso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

export default async function BookExportPage({ params }: BookExportPageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const [edition, jobs] = await Promise.all([
    getBookEdition(session, book.id),
    listExportJobs(session, book.id),
  ]);

  const canExport = canPerform(session.workspace.role, "export:create");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}`}>
            {book.title}
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Exportación
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Los archivos se generan en el momento, a partir de las versiones del manuscrito que hay en
          el libro. No hay ningún proceso permanente que los produzca: por eso la cola no necesita
          un worker y funciona en un plan gratuito.
        </p>
        {edition?.profile ? (
          <p className="text-xs text-ink-muted">
            {edition.template
              ? `Plantilla aplicada: «${edition.template.name}»`
              : `Maqueta aplicada: «${edition.profile.name}»`}{" "}
            ({edition.profile.pageWidthMm} × {edition.profile.pageHeightMm} mm).
          </p>
        ) : (
          <p className="text-xs text-ink-muted">
            Este libro no tiene plantilla de maquetación: los PDF no se pueden componer todavía.
          </p>
        )}
      </header>

      <section className="panel p-6" aria-label="generar archivo">
        <p className="meta-label">Generar</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Qué quieres exportar</h2>

        <div className="mt-5">
          {canExport ? (
            <ExportPanel bookId={book.id} hasLayout={Boolean(edition?.profile)} />
          ) : (
            <p className="text-sm leading-relaxed text-ink-muted">
              No tienes permisos para exportar en este espacio de trabajo.
            </p>
          )}
        </div>
      </section>

      <section className="panel p-6" aria-label="exportaciones anteriores">
        <p className="meta-label">Historial</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Exportaciones recientes</h2>

        {jobs.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Todavía no se ha exportado nada desde este libro.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="border-b border-line pb-2 text-sm last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">
                    {FORMAT_LABELS[job.format] ?? job.format}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {STATUS_LABELS[job.status] ?? job.status} · {formatDateTime(job.createdAt)}
                  </span>
                </div>
                {job.metadata ? (
                  <p className="text-xs text-ink-muted">
                    {job.metadata.pageCount ? `${job.metadata.pageCount} páginas · ` : ""}
                    {job.metadata.bytes.toLocaleString("es-ES")} bytes ·{" "}
                    <span className="font-mono">{job.metadata.sha256.slice(0, 12)}…</span>
                  </p>
                ) : null}
                {job.errorMessage ? (
                  <p className="text-xs text-danger">{job.errorMessage}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
