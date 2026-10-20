import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewSectionForm } from "@/components/books/new-section-form";
import { SectionTree } from "@/components/books/section-tree";
import { BookStatusControl } from "@/components/books/book-status-control";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook, getSectionTree } from "@/lib/books/queries";
import { flattenSectionTree } from "@/lib/books/section-tree";
import { BOOK_STATUS_LABELS, SECTION_TYPE_LABELS, formatDate, formatNumber } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Ficha del libro",
};

interface BookPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function BookPage({ params }: BookPageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const tree = await getSectionTree(session, book.id);
  const sections = flattenSectionTree(tree);

  const canEdit = canPerform(session.workspace.role, "book:update");
  const canCreateSection = canPerform(session.workspace.role, "section:create");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-4">
        <p className="eyebrow">
          <Link className="underline" href="/books">
            Biblioteca
          </Link>
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
              {book.title}
            </h1>
            {book.subtitle ? (
              <p className="mt-2 text-base italic text-ink-soft">{book.subtitle}</p>
            ) : null}
            <p className="mt-3 text-sm text-ink-muted">
              {book.penName ? `${book.penName} · ` : ""}
              {book.authorName}
              {book.genre ? ` · ${book.genre}` : ""} · {book.language.toUpperCase()}
            </p>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <BookStatusControl bookId={book.id} status={book.status} />
              <Link className="btn btn-secondary" href={`/books/${book.id}/edit`}>
                Editar metadatos
              </Link>
            </div>
          ) : null}
        </div>

        {book.description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">{book.description}</p>
        ) : null}

        <nav className="flex flex-wrap gap-2" aria-label="Acciones del libro">
          <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}/notes`}>
            Notas
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}/review`}>
            Revisión
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}/layout`}>
            Maquetación
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}/export`}>
            Exportación
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}/edit`}>
            Editar metadatos
          </Link>
        </nav>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen del libro">
        <div className="stat-card">
          <p className="meta-label">Palabras</p>
          <p className="mt-4 font-serif text-3xl tabular-nums text-ink">
            {formatNumber(book.wordCount)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {book.targetWordCount
              ? `Objetivo: ${formatNumber(book.targetWordCount)}`
              : "Sin objetivo declarado"}
          </p>
        </div>

        <div className="stat-card">
          <p className="meta-label">Capítulos</p>
          <p className="mt-4 font-serif text-3xl tabular-nums text-ink">
            {formatNumber(book.chapterCount)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {formatNumber(sections.length)} secciones en total
          </p>
        </div>

        <div className="stat-card">
          <p className="meta-label">Progreso</p>
          <p className="mt-4 font-serif text-3xl tabular-nums text-ink">
            {book.targetWordCount ? `${book.writingProgress}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {BOOK_STATUS_LABELS[book.status] ?? book.status}
          </p>
        </div>

        <div className="stat-card">
          <p className="meta-label">Última modificación</p>
          <p className="mt-4 font-serif text-xl text-ink">{formatDate(book.updatedAt)}</p>
          <p className="mt-1 text-xs text-ink-muted">Creado por {book.createdBy.name}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="panel p-6" aria-labelledby="structure-title">
          <p className="meta-label">Estructura</p>
          <h2 id="structure-title" className="mt-1.5 font-serif text-2xl text-ink">
            Secciones
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Cada sección guarda su propio historial de revisiones. El orden y la jerarquía se
            reflejan en la maquetación posterior.
          </p>

          <div className="mt-5">
            <SectionTree bookId={book.id} nodes={tree} />
          </div>
        </section>

        {canCreateSection ? (
          <section className="panel p-6" aria-labelledby="new-section-title">
            <p className="meta-label">Añadir</p>
            <h2 id="new-section-title" className="mt-1.5 font-serif text-2xl text-ink">
              Nueva sección
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-ink-muted">
              Empieza por el título; el manuscrito se escribe después.
            </p>

            <NewSectionForm
              bookId={book.id}
              parents={sections.map((section) => ({ id: section.id, title: section.title }))}
            />
          </section>
        ) : (
          <section className="panel p-6" aria-labelledby="structure-note">
            <p className="meta-label">Estructura</p>
            <h2 id="structure-note" className="mt-1.5 font-serif text-2xl text-ink">
              {sections.length === 0 ? "Sin secciones todavía" : "Estructura en marcha"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {sections.length === 0
                ? "Todavía no hay secciones en este libro."
                : `Las secciones se organizan en ${
                    sections
                      .filter((section) => section.type === "CHAPTER" || section.type === "PART")
                      .map((section) => SECTION_TYPE_LABELS[section.type])
                      .join(", ") || "varios niveles"
                  }.`}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
