import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/books/book-form";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";

export const metadata: Metadata = {
  title: "Editar libro",
};

interface EditBookPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function EditBookPage({ params }: EditBookPageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  if (!canPerform(session.workspace.role, "book:update")) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}`}>
            {book.title}
          </Link>
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          Editar metadatos
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Estos datos identifican la obra. No afectan al manuscrito ya escrito.
        </p>
      </header>

      <section className="panel p-6 sm:p-7">
        <BookForm
          mode="edit"
          bookId={book.id}
          initialValues={{
            title: book.title,
            subtitle: book.subtitle ?? undefined,
            authorName: book.authorName,
            penName: book.penName ?? undefined,
            description: book.description ?? undefined,
            genre: book.genre ?? undefined,
            language: book.language,
            targetWordCount: book.targetWordCount ?? undefined,
          }}
        />
      </section>
    </div>
  );
}
