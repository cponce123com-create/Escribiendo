import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GlossaryPanel } from "@/components/books/glossary-panel";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Glosario",
};

interface GlossaryPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function GlossaryPage({ params }: GlossaryPageProps) {
  const session = await requireSession();
  const { bookId } = await params;
  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const [terms, section] = await Promise.all([
    prisma.bookGlossaryTerm.findMany({
      where: { bookId: book.id },
      orderBy: { term: "asc" },
      select: { id: true, term: true, definition: true },
    }),
    prisma.bookSection.findFirst({
      where: { bookId: book.id, type: "GLOSSARY", deletedAt: null },
      select: { id: true },
    }),
  ]);

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
          <h1 className="mt-1 font-serif text-3xl text-ink">Glosario</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Define los términos propios del libro. Cuando estén listos, genera la sección de
            glosario: se crea como una sección normal, así que se revisa y se exporta como el resto
            del manuscrito.
          </p>
        </div>
        <Link className="btn btn-ghost btn-sm" href={`/books/${book.id}`}>
          ← Ficha del libro
        </Link>
      </header>

      {canEdit ? (
        <GlossaryPanel
          bookId={book.id}
          terms={terms}
          hasSection={section !== null}
          sectionId={section?.id ?? null}
        />
      ) : (
        <section className="panel p-5" aria-label="Glosario">
          <h2 className="font-serif text-xl text-ink">Términos</h2>
          {terms.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Este libro todavía no tiene términos.</p>
          ) : (
            <dl className="mt-3 space-y-2">
              {terms.map((term) => (
                <div key={term.id}>
                  <dt className="text-sm font-semibold text-ink">{term.term}</dt>
                  <dd className="text-sm text-ink-soft">{term.definition}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
    </div>
  );
}
