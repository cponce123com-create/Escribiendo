import Link from "next/link";
import { notFound } from "next/navigation";
import { BookAnalysisDashboard } from "@/components/books/book-analysis-dashboard";
import { analyzeBookEditorially } from "@/lib/books/editorial-analysis";
import { requireSession } from "@/lib/auth/session";

export const metadata = {
  title: "Análisis editorial",
  description: "Sugerencias de estilo, repetición, legibilidad y ritmo para tu manuscrito.",
};

export default async function BookAnalysisPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const session = await requireSession();
  const { bookId } = await params;
  const analysis = await analyzeBookEditorially(session, bookId);
  if (!analysis) notFound();

  return (
    <div className="space-y-5">
      <Link className="btn btn-ghost btn-sm" href={`/books/${bookId}`}>
        ← Volver al libro
      </Link>
      <BookAnalysisDashboard {...analysis} />
    </div>
  );
}
