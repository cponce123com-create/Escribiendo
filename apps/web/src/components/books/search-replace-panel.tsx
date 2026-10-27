"use client";

import Link from "next/link";
import { useState } from "react";
import {
  replaceInBook,
  searchBook,
  type SearchBookResponse,
} from "@/lib/books/search-replace-actions";

interface SearchReplacePanelProps {
  bookId: string;
}

type Result = Extract<SearchBookResponse, { ok: true }>;
type Busy = "search" | "replace" | null;

export function SearchReplacePanel({ bookId }: SearchReplacePanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  const options = { query, caseSensitive, wholeWord };

  const invalidate = (): void => {
    setResult(null);
    setNotice("");
    setConfirmed(false);
  };

  const runSearch = async (): Promise<void> => {
    setBusy("search");
    setError("");
    setNotice("");
    setConfirmed(false);

    try {
      const response = await searchBook(bookId, options);

      if (!response.ok) {
        setResult(null);
        setError(response.error);
        return;
      }

      setResult(response);
    } catch {
      setResult(null);
      setError("No se ha podido completar la búsqueda.");
    } finally {
      setBusy(null);
    }
  };

  const runReplace = async (): Promise<void> => {
    if (!result || result.total === 0) {
      return;
    }

    setBusy("replace");
    setError("");

    try {
      const response = await replaceInBook(bookId, { ...options, replacement });

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setNotice(
        response.replacements === 0
          ? "No había coincidencias que reemplazar."
          : `Se reemplazaron ${response.replacements} coincidencias en ${response.sections} secciones.`,
      );
      setResult(null);
      setConfirmed(false);
    } catch {
      setError("No se ha podido completar el reemplazo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <form
        className="panel space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="search-query">
              Buscar
            </label>
            <input
              id="search-query"
              className="field-input"
              value={query}
              maxLength={200}
              onChange={(event) => {
                setQuery(event.target.value);
                invalidate();
              }}
              placeholder="Marta"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="search-replacement">
              Reemplazar por
            </label>
            <input
              id="search-replacement"
              className="field-input"
              value={replacement}
              maxLength={200}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="Elena"
              autoComplete="off"
            />
          </div>
        </div>

        <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
          <legend className="field-label">Opciones</legend>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => {
                setCaseSensitive(event.target.checked);
                invalidate();
              }}
            />
            Distinguir mayúsculas
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(event) => {
                setWholeWord(event.target.checked);
                invalidate();
              }}
            />
            Palabra completa
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy !== null || query.trim().length === 0}
          >
            {busy === "search" ? "Buscando…" : "Buscar"}
          </button>
          <span className="text-xs text-ink-muted" role="status" aria-live="polite">
            {error}
            {notice}
          </span>
        </div>
      </form>

      {result ? (
        <section className="panel space-y-4 p-5" aria-labelledby="search-results-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="search-results-title" className="font-serif text-xl text-ink">
              {result.total === 0
                ? "Sin coincidencias"
                : `${result.total} coincidencias en ${result.sections.length} secciones`}
            </h2>
            {result.truncated ? (
              <p className="text-xs text-ink-muted">
                Se alcanzó el límite de resultados; acota la búsqueda para verlas todas.
              </p>
            ) : null}
          </div>

          {result.sections.length > 0 ? (
            <ul className="space-y-3">
              {result.sections.map((section) => (
                <li key={section.sectionId} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      className="text-sm font-semibold text-ink underline"
                      href={`/books/${bookId}/sections/${section.sectionId}`}
                    >
                      {section.sectionTitle}
                    </Link>
                    <span className="text-xs text-ink-muted">
                      {section.count} {section.count === 1 ? "coincidencia" : "coincidencias"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {section.excerpts.map((excerpt, index) => (
                      <li key={`${section.sectionId}-${index}`} className="text-sm text-ink-soft">
                        …{excerpt.before}
                        <mark>{excerpt.match}</mark>
                        {excerpt.after}…
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}

          {result.total > 0 ? (
            <div className="space-y-3 rounded-lg border border-line bg-surface-subtle p-3">
              <p className="text-sm text-ink-soft">
                El reemplazo modifica {result.sections.length}{" "}
                {result.sections.length === 1 ? "sección" : "secciones"} y guarda una revisión por
                cada una.
              </p>
              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1"
                />
                Entiendo que el cambio afecta a todo el libro.
              </label>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={!confirmed || busy !== null}
                onClick={() => void runReplace()}
              >
                {busy === "replace" ? "Reemplazando…" : `Reemplazar ${result.total} coincidencias`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
