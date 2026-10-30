import type { Metadata } from "next";
import { ModularPlanningBoard } from "@/components/story/modular-planning-board";
import { loadModularPlan } from "@/lib/story/modular/queries";
import { PlanError } from "@/lib/story/modular/structure";
import { WritingPlanning } from "@/components/story/writing-planning";
import { loadWritingPlanning } from "@/lib/story/writing/queries";
import { WritingGuideError } from "@/lib/story/writing/brief";
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
  searchParams: Promise<{ book?: string; q?: string; view?: string; section?: string }>;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const books = await guardStorySchema(() => listStoryBooks(session));
  const selectedBook = await guardStorySchema(() =>
    getStoryBookOption(
      session,
      params.book || (params.view === "ideas" ? undefined : books[0]?.id),
    ),
  );
  const view =
    params.view === "guides" ? "guides" : params.view === "ideas" ? "ideas" : "structure";
  const search = params.q?.trim() ?? "";
  const items =
    view === "ideas" || !selectedBook
      ? await guardStorySchema(() => listPlanItems(session, { search }))
      : [];
  let modularData = null;
  let writingData = null;
  let writingError = "";
  if (selectedBook) {
    try {
      if (view === "guides")
        writingData = await guardStorySchema(() => loadWritingPlanning(session, selectedBook.id));
      else if (view === "structure")
        modularData = await guardStorySchema(() => loadModularPlan(session, selectedBook.id));
    } catch (error) {
      if (error instanceof WritingGuideError || error instanceof PlanError)
        writingError = error.message;
      else throw error;
    }
  }
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
          Planificación literaria
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Construye el recorrido del libro: partes, capítulos y escenas. Organiza el esqueleto antes
          de desarrollar el manuscrito.
        </p>
      </header>

      <section className="panel filter-panel p-5" aria-label="Filtros de planificación">
        <form method="get" className="studio-filters studio-filters-compact">
          <div>
            <label className="field-label" htmlFor="plan-book">
              Libro
            </label>
            <input type="hidden" name="view" value={view} />
            <select
              id="plan-book"
              name="book"
              className="field-input"
              defaultValue={selectedBook?.id ?? ""}
            >
              <option value="">Selecciona un libro</option>
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

      <nav className="plan-page-nav" aria-label="Herramientas de planificación">
        {selectedBook ? (
          <>
            <Link
              aria-current={view === "structure" ? "page" : undefined}
              href={`/planning?book=${selectedBook.id}`}
            >
              Estructura del libro
            </Link>
            <Link
              aria-current={view === "guides" ? "page" : undefined}
              href={`/planning?book=${selectedBook.id}&view=guides`}
            >
              Guías para IA
            </Link>
          </>
        ) : null}
        <Link aria-current={view === "ideas" ? "page" : undefined} href="/planning?view=ideas">
          Ideas del estudio
        </Link>
        {canPerform(session.workspace.role, "book:create") ? (
          <Link href="/books/new">Nuevo libro</Link>
        ) : null}
      </nav>
      {modularData ? (
        <ModularPlanningBoard
          key={modularData.book.id}
          data={modularData}
          canManage={canManage}
          initialSearch={search}
        />
      ) : null}
      {writingError ? (
        <p className="alert alert-error" role="status">
          {writingError}
        </p>
      ) : null}
      {writingData ? (
        <WritingPlanning
          key={writingData.book.id}
          data={writingData}
          canManage={canManage}
          initialSectionId={params.section}
        />
      ) : !selectedBook ? (
        <p className="alert" role="status">
          Selecciona un libro y pulsa Filtrar para abrir su ficha maestra y preparar las guías de
          capítulos.
        </p>
      ) : null}

      {view === "ideas" || !selectedBook ? (
        <PlanningBoard
          books={books}
          items={items}
          canManage={canManage}
          defaultBookId={selectedBook?.id ?? ""}
          isFiltered={isFiltered}
        />
      ) : null}
    </div>
  );
}
