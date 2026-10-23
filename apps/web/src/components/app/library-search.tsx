"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { StudioIcon } from "@/components/books/studio-icon";

/** Búsqueda real en la biblioteca, disponible desde cualquier pantalla del estudio. */
export function LibrarySearch() {
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (/^\/books\/[^/]+\/sections\/[^/]+$/.test(pathname)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [pathname]);
  return (
    <form action="/books" role="search" className="library-search">
      <StudioIcon name="search" />
      <input
        ref={input}
        name="q"
        type="search"
        aria-label="Buscar en la biblioteca"
        placeholder="Buscar libros, autoría o género…"
      />
      <button type="submit" aria-label="Buscar libros" title="Buscar libros (Ctrl/⌘+K)">
        <span aria-hidden="true">↵</span>
      </button>
    </form>
  );
}
