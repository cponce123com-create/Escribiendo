"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Dialog } from "@/components/forms/dialog";
import {
  searchBookManuscriptAction,
  replaceBookManuscriptAction,
} from "@/lib/books/manuscript-search-actions";
import type { ManuscriptMatch } from "@/lib/books/manuscript-search";

export function ManuscriptSearchPanel({ bookId, canEdit }: { bookId: string; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matches, setMatches] = useState<ManuscriptMatch[]>([]);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const searchRequest = useRef(0);
  const [pending, startTransition] = useTransition();
  const total = useMemo(() => matches.reduce((sum, item) => sum + item.count, 0), [matches]);

  useEffect(() => {
    const requestId = ++searchRequest.current;
    const needle = query.trim();
    window.dispatchEvent(new CustomEvent("studio-search-highlight", { detail: needle }));
    if (!needle) {
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        let result: ManuscriptMatch[];
        try {
          result = await searchBookManuscriptAction(bookId, needle);
        } catch {
          if (searchRequest.current === requestId)
            setMessage("No se pudo completar la búsqueda. Vuelve a intentarlo.");
          return;
        }
        if (searchRequest.current !== requestId) return;
        setMatches(result);
        setMessage(
          result.length
            ? `${result.reduce((sum, item) => sum + item.count, 0)} coincidencias en ${result.length} secciones`
            : "No se encontraron coincidencias.",
        );
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
      setConfirming(false);
      setMessage("Guarda primero los cambios pendientes del capítulo abierto.");
      return;
    }
    if (!total || pending) return;
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await replaceBookManuscriptAction(bookId, query, replacement);
        setMessage(
          result.error ?? `Se reemplazaron ${result.count} coincidencias en todo el libro.`,
        );
        if (!result.error) setReplacement("");
        if (result.count > 0 && !result.error) window.location.reload();
      } catch {
        setMessage(
          "No se pudo confirmar el reemplazo. Vuelve a buscar antes de intentarlo otra vez.",
        );
      }
    });
  };

  return (
    <section className="studio-card manuscript-search" aria-label="Buscar en el manuscrito">
      <h2>Buscar en el libro</h2>
      <label className="sr-only" htmlFor="manuscript-search-query">
        Palabra o frase
      </label>
      <input
        id="manuscript-search-query"
        className="field-input"
        type="search"
        value={query}
        maxLength={120}
        onChange={(event) => {
          setQuery(event.target.value);
          setMatches([]);
          setMessage("");
        }}
        placeholder="Buscar una palabra o frase…"
      />
      {canEdit ? (
        <div className="manuscript-search-replace">
          <label className="sr-only" htmlFor="manuscript-search-replacement">
            Reemplazar por
          </label>
          <input
            id="manuscript-search-replacement"
            className="field-input"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="Reemplazar por…"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!total || pending}
            onClick={() => setConfirming(true)}
          >
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
              <Link
                href={`/books/${bookId}/sections/${match.sectionId}?find=${encodeURIComponent(query.trim())}`}
              >
                <strong>{match.sectionTitle}</strong>
                <span>
                  {match.count} {match.count === 1 ? "coincidencia" : "coincidencias"}
                </span>
                <small>{match.excerpt}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {confirming ? (
        <Dialog
          abierto
          titulo="Reemplazar en todo el libro"
          descripcion={`Se reemplazarán ${total} coincidencias. Se guardará una revisión de cada sección modificada.`}
          onCerrar={() => setConfirming(false)}
        >
          <p className="text-sm text-ink-soft">
            Busca: <strong className="break-words">{query}</strong>
          </p>
          <p className="text-sm text-ink-soft">
            Reemplaza por:{" "}
            <strong className="break-words">{replacement || "(eliminar el texto)"}</strong>
          </p>
          <p className="text-sm text-ink-soft">Guarda primero los cambios del capítulo abierto.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={replaceAll}
            >
              Confirmar reemplazo
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
