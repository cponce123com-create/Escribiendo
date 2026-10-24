import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { countBooks, listBooks, type BookSort } from "@/lib/books/queries";
import { BOOK_STATUS_LABELS, formatDate, formatNumber, formatPercent } from "@/lib/ui/format";
import { LibraryIcon } from "@/components/icons";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { coverObjectPosition } from "@/lib/books/covers";

export const metadata: Metadata = {
  title: "Biblioteca",
};

const STATUS_OPTIONS = ["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETE", "ARCHIVED"] as const;

const SORT_OPTIONS: Array<{ value: BookSort; label: string }> = [
  { value: "recent", label: "Modificación reciente" },
  { value: "title", label: "Título" },
  { value: "words", label: "Extensión" },
];

interface BooksPageProps {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}

function isBookStatus(value: string | undefined): value is (typeof STATUS_OPTIONS)[number] {
  return STATUS_OPTIONS.includes(value as (typeof STATUS_OPTIONS)[number]);
}

function isBookSort(value: string | undefined): value is BookSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

export default async function BooksPage({ searchParams }: BooksPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const search = params.q?.trim() ?? "";
  const status = isBookStatus(params.status) ? params.status : undefined;
  const sort: BookSort = isBookSort(params.sort) ? params.sort : "recent";

  const [books, total] = await Promise.all([
    listBooks(session, { search, status, sort }),
    countBooks(session),
  ]);

  const canCreate = canPerform(session.workspace.role, "book:create");
  const canDelete = canPerform(session.workspace.role, "book:delete");
  const isFiltered = search.length > 0 || status !== undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Biblioteca</p>
          <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
            Los libros del estudio
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {total === 0
              ? "Todavía no hay ningún libro en este espacio de trabajo."
              : `${formatNumber(total)} ${total === 1 ? "libro" : "libros"} en este espacio de trabajo.`}
          </p>
        </div>

        {canCreate ? (
          <div className="flex flex-wrap gap-3">
            <Link className="btn btn-secondary" href="/books/import">
              Importar libro
            </Link>
            <Link className="btn btn-primary" href="/books/new">
              Nuevo libro
            </Link>
          </div>
        ) : null}
      </header>

      <section className="panel filter-panel p-5" aria-label="Filtros de la biblioteca">
        <form method="get" className="studio-filters">
          <div>
            <label className="field-label" htmlFor="filter-q">
              Buscar
            </label>
            <input
              id="filter-q"
              name="q"
              type="search"
              className="field-input"
              placeholder="Título, autoría o género"
              defaultValue={search}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="filter-status">
              Estado
            </label>
            <select
              id="filter-status"
              name="status"
              className="field-input"
              defaultValue={status ?? ""}
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {BOOK_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="filter-sort">
              Ordenar por
            </label>
            <select id="filter-sort" name="sort" className="field-input" defaultValue={sort}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="studio-filter-actions">
            <button type="submit" className="btn btn-secondary">
              Filtrar
            </button>
            {isFiltered ? (
              <Link className="btn btn-ghost" href="/books">
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {books.length === 0 ? (
        <section className="panel px-6 py-12 text-center">
          <LibraryIcon className="mx-auto size-8 text-ink-muted" />
          <h2 className="mt-4 font-serif text-2xl text-ink">
            {isFiltered ? "Ningún libro coincide con el filtro." : "La biblioteca está vacía."}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {isFiltered
              ? "Prueba con otro término o quita el filtro de estado."
              : canCreate
                ? "Crea el primer libro y empieza a construir su estructura de capítulos."
                : "La creación de libros corresponde a la administración del estudio."}
          </p>
          {canCreate && !isFiltered ? (
            <Link className="btn btn-primary mt-6" href="/books/new">
              Crear el primer libro
            </Link>
          ) : null}
        </section>
      ) : (
        <ul className="space-y-3">
          {books.map((book) => (
            <li key={book.id} className="panel p-5">
              <Link href={`/books/${book.id}`} className="block transition-colors hover:opacity-80">
                <div className="grid gap-4 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                  <div className="book-cover-thumb">
                    {book.cover ? (
                      // Cloudinary entrega la imagen ya optimizada; no necesita otra transformación.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={book.cover.url}
                        alt={`Portada de ${book.title}`}
                        className="book-cover-thumb-image"
                        style={{ objectPosition: coverObjectPosition(book.cover.crop) }}
                        loading="lazy"
                      />
                    ) : (
                      <span className="book-cover-placeholder">Sin portada definitiva</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="eyebrow">{BOOK_STATUS_LABELS[book.status]}</p>
                      <h2 className="mt-2 font-serif text-xl text-ink">{book.title}</h2>
                      {book.subtitle ? (
                        <p className="mt-1 text-sm italic text-ink-soft">{book.subtitle}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-ink-muted">
                        {book.penName ? `${book.penName} · ` : ""}
                        {book.authorName}
                        {book.genre ? ` · ${book.genre}` : ""}
                      </p>
                      <p className="mt-2 text-xs text-ink-muted">
                        Modificado {formatDate(book.updatedAt)}
                      </p>
                    </div>

                    <dl className="grid shrink-0 grid-cols-3 gap-5 text-right">
                      <div>
                        <dt className="meta-label">Palabras</dt>
                        <dd className="mt-1 font-serif text-lg tabular-nums text-ink">
                          {formatNumber(book.wordCount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="meta-label">Secciones</dt>
                        <dd className="mt-1 font-serif text-lg tabular-nums text-ink">
                          {formatNumber(book.sectionCount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="meta-label">Progreso</dt>
                        <dd className="mt-1 font-serif text-lg tabular-nums text-ink">
                          {book.targetWordCount ? formatPercent(book.writingProgress) : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </Link>
              {canDelete && book.status === "DRAFT" ? (
                <div className="mt-4 flex justify-end border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link className="btn btn-primary" href={`/books/${book.id}`}>
                      Continuar escribiendo
                    </Link>
                    <DeleteBookButton bookId={book.id} title={book.title} />
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex justify-end border-t border-line pt-4">
                  <Link className="btn btn-secondary" href={`/books/${book.id}`}>
                    Continuar escribiendo
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
