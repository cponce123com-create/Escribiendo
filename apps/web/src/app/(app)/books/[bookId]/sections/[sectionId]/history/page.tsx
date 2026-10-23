import type { Metadata } from "next";
import { RestoreRevisionForm } from "@/components/books/restore-revision-form";
import { canPerform } from "@/lib/books/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getBook, getSection } from "@/lib/books/queries";
import { compareRevisions, listSectionRevisions } from "@/lib/review/compare";
import { REVISION_REASON_LABELS, formatDateTime } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Historial",
};

interface HistoryPageProps {
  params: Promise<{ bookId: string; sectionId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function HistoryPage({ params, searchParams }: HistoryPageProps) {
  const session = await requireSession();
  const { bookId, sectionId } = await params;
  const query = await searchParams;

  const [book, section, revisions] = await Promise.all([
    getBook(session, bookId),
    getSection(session, bookId, sectionId),
    listSectionRevisions(session, bookId, sectionId),
  ]);

  if (!book || !section) {
    notFound();
  }

  const fromId = query.from ?? revisions[revisions.length - 1]?.id;
  const toId = query.to ?? revisions[0]?.id;

  const comparison =
    fromId && toId && fromId !== toId
      ? await compareRevisions(session, book.id, sectionId, fromId, toId)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}/sections/${section.id}`}>
            {book.title}
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Historial de «{section.title}»
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Cada guardado crea una revisión. Las revisiones no se modifican nunca: restaurar una
          versión anterior la copia como una versión nueva.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="panel p-6" aria-label="revisiones">
          <h2 className="font-serif text-xl text-ink">Revisiones</h2>

          {revisions.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Todavía no hay revisiones. Aparecen al guardar el manuscrito.
            </p>
          ) : (
            <ol className="mt-4 space-y-1.5">
              {revisions.map((revision) => {
                const isFrom = revision.id === fromId;
                const isTo = revision.id === toId;

                return (
                  <li key={revision.id} className="text-sm">
                    <Link
                      href={`/books/${book.id}/sections/${section.id}/history?from=${revision.id}&to=${toId ?? revision.id}`}
                      className={`flex items-baseline justify-between gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-ink/5 ${
                        isFrom || isTo ? "bg-accent/10" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs text-ink-muted">
                          v{revision.version}
                        </span>{" "}
                        {REVISION_REASON_LABELS[revision.reason] ?? revision.reason}
                        {isFrom ? (
                          <span className="ml-2 text-[0.62rem] uppercase tracking-wider text-accent">
                            anterior
                          </span>
                        ) : null}
                        {isTo ? (
                          <span className="ml-2 text-[0.62rem] uppercase tracking-wider text-accent">
                            actual
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {revision.wordCount} palabras
                      </span>
                    </Link>
                    <p className="px-2 text-xs text-ink-muted">
                      {revision.author.name} · {formatDateTime(revision.createdAt)}
                    </p>
                    {canPerform(session.workspace.role, "revision:restore") &&
                    revision.version !== section.version ? (
                      <RestoreRevisionForm sectionId={section.id} revisionId={revision.id} />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="panel p-6" aria-label="comparación">
          <h2 className="font-serif text-xl text-ink">Comparación</h2>

          {comparison ? (
            <>
              <p className="mt-3 text-sm text-ink-muted">
                De la versión {comparison.from.version} a la {comparison.to.version}:{" "}
                <span className="text-success">+{comparison.summary.added} palabras</span>,{" "}
                <span className="text-danger">−{comparison.summary.removed}</span>.
              </p>

              <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {comparison.segments.map((segment, index) => (
                  <span
                    key={`${segment.type}-${index}`}
                    className={
                      segment.type === "insert"
                        ? "rounded-sm bg-success/15 text-ink"
                        : segment.type === "delete"
                          ? "rounded-sm bg-danger/15 text-ink line-through"
                          : ""
                    }
                  >
                    {segment.text}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Elige dos revisiones distintas en la lista para ver qué cambió entre ellas.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
