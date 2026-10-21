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
  const currentProfile = edition?.profile ?? null;

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
          Elige la plantilla editorial del libro. Cada plantilla trae su geometría y su tipografía
          predeterminadas: tamaño de página, márgenes, cuerpo y control de viudas y huérfanas.
        </p>
      </header>

      {mensaje ? (
        <p className="alert alert-success" role="status">
          {mensaje}
        </p>
      ) : null}

      <section className="panel p-6" aria-label="plantilla del libro">
        <p className="meta-label">Plantilla del libro</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Elige una plantilla</h2>

        <div className="mt-5">
          {canManage ? (
            <EditionSelector
              bookId={book.id}
              templates={templates}
              selectedTemplateId={edition?.template?.id ?? null}
            />
          ) : (
            <p className="text-sm leading-relaxed text-ink-muted">
              No tienes permisos para cambiar la maquetación de este estudio.
            </p>
          )}
        </div>

        {edition ? (
          <p className="mt-5 text-xs text-ink-muted">
            {edition.template
              ? `La edición actual usa la plantilla «${edition.template.name}»`
              : "La edición actual no tiene plantilla"}
            {currentProfile
              ? ` con página ${currentProfile.pageWidthMm} × ${currentProfile.pageHeightMm} mm y márgenes ${currentProfile.marginTopMm}/${currentProfile.marginBottomMm}/${currentProfile.marginInnerMm}/${currentProfile.marginOuterMm} mm.`
              : "."}
          </p>
        ) : (
          <p className="mt-5 text-xs text-ink-muted">
            Este libro todavía no tiene plantilla aplicada. Elige una para definir la geometría y la
            tipografía.
          </p>
        )}

        <div className="mt-5">
          <Link className="btn btn-secondary" href={`/books/${book.id}/preview`}>
            Ver la vista previa paginada
          </Link>
        </div>
      </section>

      <details className="panel p-6">
        <summary className="cursor-pointer">
          <span className="meta-label">Ajustes avanzados</span>
          <h2 className="mt-1.5 font-serif text-xl text-ink">Perfiles de página</h2>
          <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
            Solo si necesitas una geometría propia. La plantilla ya define una maqueta completa;
            estos perfiles quedan como ajuste opcional.
          </span>
        </summary>

        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
              Los perfiles son geometrías del estudio. Puedes crear uno propio o ajustar el que
              genera una plantilla; si vuelves a aplicar esa plantilla, el perfil recupera sus
              valores predeterminados.
            </p>
            {canManage ? (
              <Link className="btn btn-secondary" href={`/books/${book.id}/layout/profiles/new`}>
                Nuevo perfil
              </Link>
            ) : null}
          </div>

          <ProfileList
            bookId={book.id}
            profiles={profiles}
            activeProfileId={edition?.profile?.id ?? null}
          />
        </div>
      </details>
    </div>
  );
}
