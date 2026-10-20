import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditionSelector } from "@/components/layout/edition-selector";
import { ProfileList } from "@/components/layout/profile-list";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook } from "@/lib/books/queries";
import { getBookEdition, listLayoutProfiles, listTemplates } from "@/lib/layout/profiles";
import { ensureSystemTemplates } from "@/lib/layout/templates";

export const metadata: Metadata = {
  title: "Maquetación",
};

interface BookLayoutPageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ aviso?: string }>;
}

const AVISOS: Record<string, string> = {
  creado: "Perfil de página guardado.",
  actualizado: "Perfil de página actualizado.",
};

export default async function BookLayoutPage({ params, searchParams }: BookLayoutPageProps) {
  const session = await requireSession();
  const { bookId } = await params;
  const { aviso } = await searchParams;

  const book = await getBook(session, bookId);

  if (!book) {
    notFound();
  }

  // Las plantillas de sistema se instalan la primera vez que se abre la
  // maquetación; la operación es idempotente.
  await ensureSystemTemplates();

  const [profiles, templates, edition] = await Promise.all([
    listLayoutProfiles(session),
    listTemplates(session),
    getBookEdition(session, book.id),
  ]);

  const canManage = canPerform(session.workspace.role, "layout:manage");
  const mensaje = aviso ? (AVISOS[aviso] ?? null) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${book.id}`}>
            {book.title}
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Maquetación
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          El perfil de página define la geometría: tamaño, márgenes, medianil y sangrado. La
          plantilla editorial define el estilo: cuerpo, títulos y control de viudas y huérfanas.
        </p>
      </header>

      {mensaje ? (
        <p className="alert alert-success" role="status">
          {mensaje}
        </p>
      ) : null}

      <section className="panel p-6" aria-label="maqueta del libro">
        <p className="meta-label">Maqueta del libro</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Qué se imprime</h2>

        <div className="mt-5">
          {canManage ? (
            <EditionSelector
              bookId={book.id}
              profiles={profiles}
              templates={templates}
              selectedProfileId={edition?.profile?.id ?? null}
              selectedTemplateId={edition?.template?.id ?? null}
            />
          ) : (
            <p className="text-sm leading-relaxed text-ink-muted">
              No tienes permisos para cambiar la maquetación de este estudio.
            </p>
          )}
        </div>

        {edition?.profile ? (
          <p className="mt-5 text-xs text-ink-muted">
            La edición actual usa «{edition.profile.name}» con la plantilla «
            {edition.template?.name ?? "sin plantilla"}».
          </p>
        ) : (
          <p className="mt-5 text-xs text-ink-muted">
            Este libro todavía no tiene maqueta aplicada. La vista previa usará el perfil
            predeterminado del estudio.
          </p>
        )}

        <div className="mt-5">
          <Link className="btn btn-secondary" href={`/books/${book.id}/preview`}>
            Ver la vista previa paginada
          </Link>
        </div>
      </section>

      <section className="panel p-6" aria-label="perfiles de página">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="meta-label">Perfiles de página</p>
            <h2 className="mt-1.5 font-serif text-2xl text-ink">Geometrías del estudio</h2>
          </div>
          {canManage ? (
            <Link className="btn btn-secondary" href={`/books/${book.id}/layout/profiles/new`}>
              Nuevo perfil
            </Link>
          ) : null}
        </div>

        <div className="mt-5">
          <ProfileList
            bookId={book.id}
            profiles={profiles}
            activeProfileId={edition?.profile?.id ?? null}
          />
        </div>
      </section>

      <section className="panel p-6" aria-label="plantillas editoriales">
        <p className="meta-label">Plantillas</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Estilos editoriales</h2>

        <ul className="mt-4 space-y-2">
          {templates.map((template) => (
            <li key={template.id} className="text-sm">
              <span className="font-medium text-ink">{template.name}</span>
              {template.isSystem ? (
                <span className="ml-2 text-xs text-ink-muted">del sistema</span>
              ) : null}
              {template.description ? (
                <span className="block text-ink-muted">{template.description}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
