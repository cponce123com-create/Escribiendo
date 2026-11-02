import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManuscriptBookReader } from "@/components/books/manuscript-book-reader";
import { requireSession } from "@/lib/auth/session";
import { getBook } from "@/lib/books/queries";

export const metadata: Metadata = { title: "Lector del manuscrito" };

interface ReaderPageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ sectionId?: string }>;
}

export default async function ReaderPage({ params, searchParams }: ReaderPageProps) {
  const session = await requireSession();
  const [{ bookId }, { sectionId }] = await Promise.all([params, searchParams]);
  const book = await getBook(session, bookId);
  if (!book || !sectionId) notFound();

  return (
    <ManuscriptBookReader bookId={book.id} bookTitle={book.title} currentSectionId={sectionId} />
  );
}
