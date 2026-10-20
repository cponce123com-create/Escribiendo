import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentPanel } from "@/components/review/comment-panel";
import { ReviewActions } from "@/components/review/review-actions";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook, getSectionTree } from "@/lib/books/queries";
import { flattenSectionTree } from "@/lib/books/section-tree";
import { countOpenComments, listComments } from "@/lib/review/comments";
import { listMembers } from "@/lib/team/members";
import { BOOK_STATUS_LABELS } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Revisión",
};

interface BookReviewPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function BookReviewPage({ params }: BookReviewPageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  const [comments, tree, openComments, miembros] = await Promise.all([
    listComments(session, { bookId: book.id }),
    getSectionTree(session, book.id),
    countOpenComments(session, book.id),
    listMembers(session),
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
          Revisión editorial
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Los comentarios son visibles para el espacio de trabajo. Un libro no puede aprobarse
          mientras queden comentarios sin resolver.
        </p>
        <p className="text-xs text-ink-muted">
          Estado actual: {BOOK_STATUS_LABELS[book.status] ?? book.status}
        </p>
      </header>

      <section className="panel p-6" aria-label="flujo de revisión">
        <h2 className="font-serif text-xl text-ink">Flujo de revisión</h2>
        <p className="mt-2 mb-4 text-sm leading-relaxed text-ink-muted">
          {openComments > 0
            ? `Quedan ${openComments} comentarios sin resolver.`
            : "No quedan comentarios sin resolver."}
        </p>

        <ReviewActions
          bookId={book.id}
          status={book.status}
          openComments={openComments}
          canApprove={canPerform(session.workspace.role, "book:approve")}
          canSubmit={canPerform(session.workspace.role, "book:submitForReview")}
        />
      </section>

      <CommentPanel
        bookId={book.id}
        sections={sections}
        comments={comments}
        canComment={canPerform(session.workspace.role, "comment:create")}
        members={miembros}
        canAssign={canPerform(session.workspace.role, "comment:create")}
      />
    </div>
  );
}
