import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutProfileForm } from "@/components/layout/layout-profile-form";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";

export const metadata: Metadata = {
  title: "Nuevo perfil de página",
};

interface NewProfilePageProps {
  params: Promise<{ bookId: string }>;
}

export default async function NewLayoutProfilePage({ params }: NewProfilePageProps) {
  const session = await requireSession();
  const { bookId } = await params;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  if (!canPerform(session.workspace.role, "layout:manage")) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-serif text-3xl text-ink">Sin permisos</h1>
        <p className="text-sm text-ink-soft">
          No tienes permisos para gestionar la maquetación de este estudio.
        </p>
        <Link className="btn btn-secondary" href={`/books/${book.id}/layout`}>
          Volver a la maquetación
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}/layout`}>
            Maquetación
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Nuevo perfil de página
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Las medidas se validan contra el motor de maquetación: si los márgenes no dejan área de
          texto, el perfil no se guarda.
        </p>
      </header>

      <section className="panel p-6">
        <LayoutProfileForm mode="create" bookId={book.id} />
      </section>
    </div>
  );
}
