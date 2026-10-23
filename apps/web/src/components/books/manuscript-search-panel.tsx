"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { searchBookManuscriptAction, replaceBookManuscriptAction } from "@/lib/books/manuscript-search-actions";
import type { ManuscriptMatch } from "@/lib/books/manuscript-search";

export function ManuscriptSearchPanel({ bookId, canEdit }: { bookId: string; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matches, setMatches] = useState<ManuscriptMatch[]>([]);
  const [message, setMessage] = useState("");
  const searchRequest = useRef(0);
  const [pending, startTransition] = useTransition();
  const total = useMemo(() => matches.reduce((sum, item) => sum + item.count, 0), [matches]);

  useEffect(() => {
    const requestId = ++searchRequest.current;
    const needle = query.trim();
    if (!needle) {
      setMatches([]);
      setMessage("");
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchBookManuscriptAction(bookId, needle);
        if (searchRequest.current !== requestId) return;
        setMatches(result);
        setMessage(result.length ? `${result.reduce((sum, item) => sum + item.count, 0)} coincidencias en ${result.length} secciones` : "No se encontraron coincidencias.");
      });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      searchRequest.current += 1;
    };
  }, [bookId, query]);

  const replaceAll = (): void => {
    const activeEditor = document.querySelector('.manuscript-editor[data-dirty="true"]');
    if (activeEditor) {
      setMessage("Guarda primero los cambios pendientes del capítulo abierto.");
      return;
    }
    if (!total || pending || !window.confirm(`Se reemplazarán ${total} coincidencias en todo el libro. Guarda primero los cambios pendientes del capítulo abierto. ¿Continuar?`)) return;
    startTransition(async () => {
      const result = await replaceBookManuscriptAction(bookId, query, replacement);
      setMessage(result.error ?? `Se reemplazaron ${result.count} coincidencias en todo el libro.`);
      setReplacement("");
      if (result.count > 0 && !result.error) window.location.reload();
    });
  };

  return (
    <section className="studio-card manuscript-search" aria-label="Buscar en el manuscrito">
      <h2>Buscar en el libro</h2>
      <label className="sr-only" htmlFor="manuscript-search-query">Palabra o frase</label>
      <input
        id="manuscript-search-query"
        className="field-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar una palabra o frase…"
      />
      {canEdit ? (
        <div className="manuscript-search-replace">
          <label className="sr-only" htmlFor="manuscript-search-replacement">Reemplazar por</label>
          <input
            id="manuscript-search-replacement"
            className="field-input"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="Reemplazar por…"
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={!total || pending} onClick={replaceAll}>
            Reemplazar todo
          </button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="text-xs text-ink-muted">
        {pending ? "Buscando…" : message}
      </p>
      {matches.length ? (
        <ul className="manuscript-search-results">
          {matches.map((match) => (
            <li key={match.sectionId}>
              <Link href={`/books/${bookId}/sections/${match.sectionId}?find=${encodeURIComponent(query.trim())}`}>
                <strong>{match.sectionTitle}</strong>
                <span>{match.count} {match.count === 1 ? "coincidencia" : "coincidencias"}</span>
                <small>{match.excerpt}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
