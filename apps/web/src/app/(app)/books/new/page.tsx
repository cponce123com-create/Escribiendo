import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookForm } from "@/components/books/book-form";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";

export const metadata: Metadata = {
  title: "Nuevo libro",
};

export default async function NewBookPage() {
  const session = await requireSession();

  if (!canPerform(session.workspace.role, "book:create")) {
    redirect("/books");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">Biblioteca</p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          Nuevo libro
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Los metadatos identifican la obra. La estructura de capítulos y el manuscrito se añaden
          después, desde la ficha del libro.
        </p>
      </header>

      <section className="panel p-6 sm:p-7">
        <BookForm mode="create" />
      </section>

      <p className="text-sm text-ink-soft">
        ¿Ya tienes un manuscrito?{" "}
        <Link className="underline" href="/books/import">
          Importar EPUB, DOCX o PDF
        </Link>
        .
      </p>

      <p className="text-xs text-ink-muted">
        <Link className="underline" href="/books">
          Volver a la biblioteca
        </Link>
      </p>
    </div>
  );
}
