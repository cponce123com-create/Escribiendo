import Link from "next/link";
import { notFound } from "next/navigation";
import { BookAnalysisDashboard } from "@/components/books/book-analysis-dashboard";
import { analyzeBookEditorially } from "@/lib/books/editorial-analysis";
import { disabledStyleRules } from "@/lib/books/analysis-options";
import { requireSession } from "@/lib/auth/session";

export const metadata = {
  title: "Análisis editorial",
  description: "Sugerencias de estilo, repetición, legibilidad y ritmo para tu manuscrito.",
};

export default async function BookAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ section?: string; rules?: string; disableRule?: string | string[] }>;
}) {
  const session = await requireSession();
  const { bookId } = await params;
  const query = await searchParams;
  const analysis = await analyzeBookEditorially(session, bookId, {
    sectionId: query.section || undefined,
    disabledRules:
      query.rules === "custom" || query.disableRule
        ? disabledStyleRules(query.disableRule)
        : undefined,
  });
  if (!analysis) notFound();

  return (
    <div className="space-y-5">
      <Link className="btn btn-ghost btn-sm" href={`/books/${bookId}/laboratorio`}>
        ← Laboratorio Editorial
      </Link>
      <Link className="btn btn-secondary btn-sm ml-2" href={`/books/${bookId}/continuity`}>
        Continuidad narrativa →
      </Link>
      <BookAnalysisDashboard {...analysis} />
    </div>
  );
}
