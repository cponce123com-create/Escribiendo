import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listAllNotes } from "@/lib/writing/notes";
import { formatDateTime } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Mis notas",
};

export default async function NotesPage() {
  const session = await requireSession();
  const notes = await listAllNotes(session);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Escritura asistida</p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Mis notas
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Apuntes privados de todos tus libros. Solo tú los ves: no se comparten con el resto del
          estudio.
        </p>
      </header>

      {notes.length === 0 ? (
        <section className="panel px-6 py-12 text-center">
          <h2 className="font-serif text-2xl text-ink">Todavía no hay notas.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            Abre un libro y añade una nota desde su ficha.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="meta-label">
                    <Link className="underline" href={`/books/${note.bookId}`}>
                      {note.bookTitle}
                    </Link>
                    {note.sectionTitle ? ` · ${note.sectionTitle}` : ""}
                  </p>
                  <h2 className="mt-1 font-serif text-lg text-ink">
                    {note.isPinned ? <span aria-label="Fijada">📌 </span> : null}
                    {note.title}
                  </h2>
                </div>
                <Link className="btn btn-ghost btn-sm" href={`/books/${note.bookId}/notes`}>
                  Abrir
                </Link>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {note.content}
              </p>
              <p className="mt-3 text-xs text-ink-muted">
                Actualizada el {formatDateTime(note.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
