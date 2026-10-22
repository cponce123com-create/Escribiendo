import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionList } from "@/components/books/revision-list";
import { SectionEditor } from "@/components/books/section-editor";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook, getSection, getSectionTree, listRevisions } from "@/lib/books/queries";
import { listBookAssets } from "@/lib/books/assets";
import {
  emptyTiptapDocument,
  parseTiptapDocument,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import { SECTION_TYPE_LABELS, formatNumber } from "@/lib/ui/format";
import { AssignSelect } from "@/components/team/assign-select";
import { listMembers } from "@/lib/team/members";
import { ManuscriptWorkspace } from "@/components/books/manuscript-workspace";

export const metadata: Metadata = {
  title: "Manuscrito",
};

interface SectionPageProps {
  params: Promise<{ bookId: string; sectionId: string }>;
}

/** Normaliza el contenido guardado: un documento inválido se abre vacío. */
function safeContent(value: unknown): TiptapDocument {
  try {
    return parseTiptapDocument(value);
  } catch {
    return emptyTiptapDocument;
  }
}

export default async function SectionPage({ params }: SectionPageProps) {
  const session = await requireSession();
  const { bookId, sectionId } = await params;

  const section = await getSection(session, bookId, sectionId);

  if (!section) {
    notFound();
  }

  const [book, revisions, miembros, imagenes, sectionTree] = await Promise.all([
    getBook(session, bookId),
    listRevisions(session, bookId, sectionId),
    listMembers(session),
    listBookAssets(session, bookId),
    getSectionTree(session, bookId),
  ]);

  const canEdit = canPerform(session.workspace.role, "section:update");
  const canRestore = canPerform(session.workspace.role, "revision:restore");
  const canMove = canPerform(session.workspace.role, "section:move");

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="section-workspace-header">
        <div className="min-w-0">
          <p className="eyebrow flex flex-wrap items-center gap-2">
            <Link
              className="text-ink-soft transition-colors hover:text-accent"
              href={`/books/${bookId}`}
            >
              {book?.title ?? "Libro"}
            </Link>
            <span aria-hidden="true" className="text-ink-muted">
              /
            </span>
            <span>Espacio de escritura</span>
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate font-serif text-[clamp(1.9rem,3.5vw,2.75rem)] leading-[1.02] tracking-[-0.035em] text-ink">
                {section.title}
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                {SECTION_TYPE_LABELS[section.type] ?? section.type}
                <span className="mx-2 text-line-strong">·</span>
                {section.assignee ? `Asignada a ${section.assignee.name}` : "Lista para escribir"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="workspace-stat">
                <span className="workspace-stat__dot" aria-hidden="true" />
                {formatNumber(section.wordCount)} palabras
              </span>
              <span className="workspace-stat">Versión {section.version}</span>
            </div>
          </div>
        </div>

        <nav className="flex shrink-0 flex-wrap gap-2" aria-label="Acciones de la sección">
          <Link
            className="btn btn-secondary btn-sm"
            href={`/books/${bookId}/sections/${section.id}/history`}
          >
            Historial y comparador
          </Link>
        </nav>
      </header>

      <ManuscriptWorkspace
        bookId={bookId}
        nodes={sectionTree}
        activeSectionId={section.id}
        canMove={canMove}
        editor={
          <SectionEditor
            sectionId={section.id}
            sectionTitle={section.title}
            bookId={section.bookId}
            userId={session.user.id}
            content={safeContent(section.content)}
            version={section.version}
            wordCount={section.wordCount}
            canEdit={canEdit}
            bookAssets={imagenes}
          />
        }
        details={
          <aside
            className="panel section-details-panel p-5 sm:p-6"
            aria-labelledby="revisions-title"
          >
            <p className="meta-label">Historial</p>
            <h2 id="revisions-title" className="mt-1.5 font-serif text-2xl text-ink">
              Revisiones
            </h2>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-ink-muted">
              Cada guardado crea una revisión. Las revisiones no se modifican nunca: restaurar una
              versión anterior la copia como una versión nueva.
            </p>

            <RevisionList
              sectionId={section.id}
              revisions={revisions}
              currentVersion={section.version}
              canRestore={canRestore}
            />

            {canEdit ? (
              <div className="mt-6 border-t border-line pt-5">
                <p className="meta-label">Asignación</p>
                <div className="mt-3">
                  <AssignSelect
                    kind="section"
                    targetId={section.id}
                    assigneeId={section.assigneeId}
                    members={miembros}
                    label="Responsable"
                  />
                </div>
              </div>
            ) : null}
          </aside>
        }
      />
    </div>
  );
}
