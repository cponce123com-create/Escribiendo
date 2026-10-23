"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StudioIcon } from "./studio-icon";

/** La búsqueda envía una selección al editor abierto sin modificar su contenido. */
export function StudioSearch() {
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!/^\/books\/[^/]+\/sections\/[^/]+$/.test(pathname)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    const onResult = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") setResult(event.detail);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("studio-search-result", onResult);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("studio-search-result", onResult);
    };
  }, [pathname]);
  return (
    <form
      className="studio-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("studio-search", { detail: query }));
      }}
    >
      <button
        type="submit"
        aria-label="Buscar en el capítulo actual"
        title="Buscar siguiente coincidencia"
      >
        <StudioIcon name="search" />
      </button>
      <input
        ref={input}
        aria-label="Buscar en el capítulo actual"
        placeholder="Buscar en el capítulo actual…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setResult("");
        }}
      />
      <kbd>Ctrl / ⌘ K</kbd>
      {result ? (
        <output className="studio-search-result" aria-live="polite">
          {result}
        </output>
      ) : null}
    </form>
  );
}

export function StudioNotifications() {
  return (
    <details className="studio-notifications">
      <summary aria-label="Notificaciones" title="Notificaciones">
        <StudioIcon name="bell" />
      </summary>
      <div>
        <strong>Notificaciones</strong>
        <p>El centro de notificaciones está pendiente de implementación.</p>
      </div>
    </details>
  );
}
