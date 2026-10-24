import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookImportForm } from "@/components/books/book-import-form";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";

export const metadata: Metadata = {
  title: "Importar libro",
};

export default async function ImportBookPage() {
  const session = await requireSession();
  if (!canPerform(session.workspace.role, "book:create")) redirect("/books");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">Biblioteca</p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          Importar un libro
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Sube un EPUB, DOCX o PDF para crear un libro con sus metadatos y capítulos editables. El
          texto se guarda en el manuscrito y el archivo original se descarta al terminar la
          importación.
        </p>
      </header>

      <section className="panel p-6 sm:p-7" aria-label="Archivo y datos del libro">
        <BookImportForm />
      </section>

      <p className="text-xs text-ink-muted">
        <Link className="underline" href="/books">
          Volver a la biblioteca
        </Link>
      </p>
    </div>
  );
}
