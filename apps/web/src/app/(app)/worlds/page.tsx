import type { Metadata } from "next";
import Link from "next/link";
import { WorldDirectory } from "@/components/story/world-directory";
import { WorldCoveragePanel } from "@/components/story/world-coverage-panel";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { WORLD_KIND_OPTIONS, WORLD_KIND_VALUES, type WorldKindValue } from "@/lib/story/labels";
import { getStoryBookOption, listStoryBooks, listWorlds } from "@/lib/story/queries";
import { guardStorySchema } from "@/lib/story/schema-guard";

export const metadata: Metadata = {
  title: "Mundos",
};

function isWorldKind(value: string | undefined): value is WorldKindValue {
  return WORLD_KIND_VALUES.includes(value as WorldKindValue);
}

interface WorldsPageProps {
  searchParams: Promise<{ book?: string; kind?: string; q?: string }>;
}

export default async function WorldsPage({ searchParams }: WorldsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const [books, selectedBook] = await guardStorySchema(() =>
    Promise.all([listStoryBooks(session), getStoryBookOption(session, params.book)]),
  );
  const kind = isWorldKind(params.kind) ? params.kind : undefined;
  const search = params.q?.trim() ?? "";
  const worlds = await guardStorySchema(() =>
    listWorlds(session, {
      bookId: selectedBook?.id,
      kind,
      search,
    }),
  );
  const canManage = canPerform(session.workspace.role, "story:manage");
  const isFiltered = Boolean(selectedBook || kind || search);

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
            "Mundos"
          )}
        </p>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          El mundo que sostiene la historia
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Lugares, culturas, organizaciones y reglas. Todo lo que necesita ser coherente cuando los
          personajes cruzan una puerta.
        </p>
      </header>

      <section className="panel filter-panel p-5" aria-label="Filtros de mundos">
        <form method="get" className="studio-filters">
          <div>
            <label className="field-label" htmlFor="world-book">
              Libro
            </label>
            <select
              id="world-book"
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
            <label className="field-label" htmlFor="world-kind">
              Tipo
            </label>
            <select id="world-kind" name="kind" className="field-input" defaultValue={kind ?? ""}>
              <option value="">Todos los tipos</option>
              {WORLD_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="world-q">
              Buscar
            </label>
            <input
              id="world-q"
              name="q"
              type="search"
              className="field-input"
              placeholder="Nombre o descripción"
              defaultValue={search}
            />
          </div>

          <div className="studio-filter-actions">
            <button type="submit" className="btn btn-secondary">
              Filtrar
            </button>
            {isFiltered ? (
              <Link className="btn btn-ghost" href="/worlds">
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {canManage && selectedBook ? <WorldCoveragePanel bookId={selectedBook.id} /> : null}

      <WorldDirectory
        books={books}
        worlds={worlds}
        canManage={canManage}
        defaultBookId={selectedBook?.id ?? ""}
        isFiltered={isFiltered}
      />
    </div>
  );
}
