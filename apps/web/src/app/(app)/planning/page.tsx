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
  searchParams: Promise<{
    book?: string;
    q?: string;
    view?: string;
    section?: string;
    trashPage?: string;
    panel?: string;
  }>;
}

export default async function PlanningPage({ searchParams }: PlanningPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const books = await guardStorySchema(() => listStoryBooks(session));
  const selectedBook = await guardStorySchema(() => getStoryBookOption(session, params.book));
  const view =
    params.view === "guides" ? "guides" : params.view === "ideas" ? "ideas" : "structure";
  const choosingBook = !selectedBook && view !== "ideas";
  const search = params.q?.trim() ?? "";
  const items =
    view === "ideas" ? await guardStorySchema(() => listPlanItems(session, { search })) : [];
  let modularData = null;
  let writingData = null;
  let writingError = "";
  if (selectedBook) {
    try {
      if (view === "guides")
        writingData = await guardStorySchema(() => loadWritingPlanning(session, selectedBook.id));
      else if (view === "structure")
        modularData = await guardStorySchema(() =>
          loadModularPlan(session, selectedBook.id, Number(params.trashPage ?? 1)),
        );
    } catch (error) {
      if (error instanceof WritingGuideError || error instanceof PlanError)
        writingError = error.message;
      else throw error;
    }
  }
  const canManage = canPerform(session.workspace.role, "story:manage");
  const isFiltered = Boolean(selectedBook || search);

  return (
    <div
      className={
        view === "structure" && !choosingBook
          ? "planning-workspace mx-auto"
          : "mx-auto min-w-0 max-w-6xl space-y-8"
      }
    >
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

      {choosingBook ? (
        <section className="panel space-y-6 p-5 sm:p-7" aria-labelledby="planning-book-choice">
          <div>
            <h2 id="planning-book-choice" className="font-serif text-2xl text-ink">
              ¿Con qué libro quieres continuar?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
              Elige un proyecto existente para seguir armando su estructura, o crea un libro nuevo
              para comenzar desde cero.
            </p>
          </div>
          {books.length ? (
            <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {books.map((book) => (
                <li key={book.id} className="min-w-0">
                  <Link
                    className="panel flex h-full min-w-0 items-center justify-between gap-4 p-4 transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    href={`/planning?book=${book.id}`}
                    aria-label={`Continuar planificando «${book.title}»`}
                  >
                    <span className="min-w-0">
                      <span className="eyebrow">Proyecto · libro</span>
                      <span className="mt-1 block truncate font-serif text-lg text-ink">
                        {book.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-accent">Continuar →</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="alert" role="status">
              Todavía no hay libros en este espacio de trabajo. Crea uno para empezar su
              planificación.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {canPerform(session.workspace.role, "book:create") ? (
              <Link className="btn btn-primary" href="/books/new">
                Crear un proyecto nuevo
              </Link>
            ) : null}
            <Link className="btn btn-secondary" href="/books">
              Ver biblioteca
            </Link>
          </div>
        </section>
      ) : null}
      {!choosingBook ? (
        <details className="plan-book-picker" open={view !== "structure"}>
          <summary>
            Libro: {selectedBook?.title ?? "Seleccionar libro"}
            <span>Cambiar libro</span>
          </summary>
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
                <button type="submit" name="view" value={view} className="btn btn-secondary">
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
        </details>
      ) : null}
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
          initialTrashOpen={canManage && params.panel === "trash"}
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
      ) : null}

      {view === "ideas" ? (
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
