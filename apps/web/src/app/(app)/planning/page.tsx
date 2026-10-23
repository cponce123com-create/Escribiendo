import type { Metadata } from "next";
import Link from "next/link";
import { PlanningBoard } from "@/components/story/planning-board";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getStoryBookOption, listPlanItems, listStoryBooks } from "@/lib/story/queries";
import { guardStorySchema } from "@/lib/story/schema-guard";

export const metadata: Metadata = {
  title: "Planificación",
};

interface PlanningPageProps {
  searchParams: Promise<{ book?: string; q?: string }>;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const [books, selectedBook] = await guardStorySchema(() =>
    Promise.all([listStoryBooks(session), getStoryBookOption(session, params.book)]),
  );
  const search = params.q?.trim() ?? "";
  const items = await guardStorySchema(() =>
    listPlanItems(session, {
      bookId: selectedBook?.id,
      search,
    }),
  );
  const canManage = canPerform(session.workspace.role, "story:manage");
  const isFiltered = Boolean(selectedBook || search);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          Herramientas ·{" "}
          {selectedBook ? (
            <Link className="underline" href={`/books/${selectedBook.id}`}>
              {selectedBook.title}
            </Link>
          ) : (
            "Planificación"
          )}
        </p>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          El mapa de la historia
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Ordena las ideas antes de escribirlas. Cada tarjeta puede pertenecer a un libro o quedar
          como material general del estudio.
        </p>
      </header>

      <section className="panel filter-panel p-5" aria-label="Filtros de planificación">
        <form method="get" className="studio-filters studio-filters-compact">
          <div>
            <label className="field-label" htmlFor="plan-book">
              Libro
            </label>
            <select
              id="plan-book"
              name="book"
              className="field-input"
              defaultValue={selectedBook?.id ?? ""}
            >
              <option value="">Todo el estudio</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="plan-q">
              Buscar
            </label>
            <input
              id="plan-q"
              name="q"
              type="search"
              className="field-input"
              placeholder="Título o resumen"
              defaultValue={search}
            />
          </div>

          <div className="studio-filter-actions">
            <button type="submit" className="btn btn-secondary">
              Filtrar
            </button>
            {isFiltered ? (
              <Link className="btn btn-ghost" href="/planning">
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <PlanningBoard
        books={books}
        items={items}
        canManage={canManage}
        defaultBookId={selectedBook?.id ?? ""}
        isFiltered={isFiltered}
      />
    </div>
  );
}
