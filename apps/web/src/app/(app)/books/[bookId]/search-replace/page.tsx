import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchReplacePanel } from "@/components/books/search-replace-panel";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";

export const metadata: Metadata = {
  title: "Buscar y reemplazar",
};

interface SearchReplacePageProps {
  params: Promise<{ bookId: string }>;
}

export default async function SearchReplacePage({ params }: SearchReplacePageProps) {
  const session = await requireSession();
  const { bookId } = await params;
  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const canEdit = canPerform(session.workspace.role, "section:update");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            <Link className="underline" href={`/books/${book.id}`}>
              {book.title}
            </Link>
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Buscar y reemplazar</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Revisa todas las secciones antes de cambiar nada. Cada sección modificada guarda una
            revisión manual, así que el cambio se puede deshacer desde el historial.
          </p>
        </div>
        <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}`}>
          ← Ficha del libro
        </Link>
      </header>

      {canEdit ? (
        <SearchReplacePanel bookId={book.id} />
      ) : (
        <p className="panel p-5 text-sm text-ink-muted">
          No tienes permisos para editar el manuscrito de este libro.
        </p>
      )}
    </div>
  );
}
