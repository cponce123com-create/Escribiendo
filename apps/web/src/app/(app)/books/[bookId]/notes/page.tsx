import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotesPanel } from "@/components/writing/notes-panel";
import { requireSession } from "@/lib/auth/session";
import { getBook } from "@/lib/books/queries";
import { listBookNotes } from "@/lib/writing/notes";
import { flattenSectionTree } from "@/lib/books/section-tree";
import { getSectionTree } from "@/lib/books/queries";

export const metadata: Metadata = {
  title: "Notas",
};

interface BookNotesPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function BookNotesPage({ params }: BookNotesPageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const [notes, tree] = await Promise.all([
    listBookNotes(session, book.id),
    getSectionTree(session, book.id),
  ]);

  const sections = flattenSectionTree(tree).map((section) => ({
    id: section.id,
    title: section.title,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}`}>
            {book.title}
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Notas de trabajo
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Apuntes privados sobre este libro. No los ve nadie más del estudio y no forman parte del
          manuscrito.
        </p>
      </header>

      <NotesPanel bookId={book.id} sections={sections} notes={notes} />
    </div>
  );
}
