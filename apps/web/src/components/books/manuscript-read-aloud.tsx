import Link from "next/link";

interface ManuscriptReadAloudProps {
  bookId: string;
  currentSectionId: string;
}

/** Abre la vista de lectura a pantalla completa, separada del espacio de edición. */
export function ManuscriptReadAloud({ bookId, currentSectionId }: ManuscriptReadAloudProps) {
  return (
    <section
      aria-label="Lector de voz del manuscrito"
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm"
    >
      <div>
        <h2 className="text-sm font-semibold">Escuchar este manuscrito</h2>
        <p className="text-xs text-ink-muted">
          Abre el lector con páginas, progreso y resaltado sincronizado.
        </p>
      </div>
      <Link
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-white"
        href={`/books/${bookId}/reader?sectionId=${encodeURIComponent(currentSectionId)}`}
      >
        Abrir lector
      </Link>
    </section>
  );
}
