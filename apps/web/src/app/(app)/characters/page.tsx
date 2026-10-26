import type { Metadata } from "next";
import Link from "next/link";
import { CharacterDirectory } from "@/components/story/character-directory";
import { BibleExportButton } from "@/components/story/bible-export-button";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import {
  CHARACTER_ROLE_OPTIONS,
  CHARACTER_ROLE_VALUES,
  type CharacterRoleValue,
} from "@/lib/story/labels";
import { getStoryBookOption, listCharacters, listStoryBooks } from "@/lib/story/queries";
import { guardStorySchema } from "@/lib/story/schema-guard";

export const metadata: Metadata = {
  title: "Personajes",
};

function isCharacterRole(value: string | undefined): value is CharacterRoleValue {
  return CHARACTER_ROLE_VALUES.includes(value as CharacterRoleValue);
}

interface CharactersPageProps {
  searchParams: Promise<{ book?: string; role?: string; q?: string }>;
}

export default async function CharactersPage({ searchParams }: CharactersPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const [books, selectedBook] = await guardStorySchema(() =>
    Promise.all([listStoryBooks(session), getStoryBookOption(session, params.book)]),
  );
  const role = isCharacterRole(params.role) ? params.role : undefined;
  const search = params.q?.trim() ?? "";
  const characters = await guardStorySchema(() =>
    listCharacters(session, {
      bookId: selectedBook?.id,
      role,
      search,
    }),
  );
  const canManage = canPerform(session.workspace.role, "story:manage");
  const isFiltered = Boolean(selectedBook || role || search);

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
            "Personajes"
          )}
        </p>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          El reparto de la historia
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Quién es quién, qué quiere cada persona y qué se interpone. Las fichas se comparten con el
          estudio; no forman parte del manuscrito.
        </p>
      </header>

      <section className="panel filter-panel p-5" aria-label="Filtros de personajes">
        <form method="get" className="studio-filters">
          <div>
            <label className="field-label" htmlFor="character-book">
              Libro
            </label>
            <select
              id="character-book"
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
            <label className="field-label" htmlFor="character-role">
              Papel
            </label>
            <select
              id="character-role"
              name="role"
              className="field-input"
              defaultValue={role ?? ""}
            >
              <option value="">Todos los papeles</option>
              {CHARACTER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="character-q">
              Buscar
            </label>
            <input
              id="character-q"
              name="q"
              type="search"
              className="field-input"
              placeholder="Nombre, oficio o descripción"
              defaultValue={search}
            />
          </div>

          <div className="studio-filter-actions">
            <button type="submit" className="btn btn-secondary">
              Filtrar
            </button>
            {isFiltered ? (
              <Link className="btn btn-ghost" href="/characters">
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {canManage && selectedBook ? <BibleExportButton bookId={selectedBook.id} /> : null}

      <CharacterDirectory
        books={books}
        characters={characters}
        canManage={canManage}
        defaultBookId={selectedBook?.id ?? ""}
        isFiltered={isFiltered}
      />
    </div>
  );
}
