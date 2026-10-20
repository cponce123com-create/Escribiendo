import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RevisionList } from "@/components/books/revision-list";
import { SectionEditor } from "@/components/books/section-editor";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getSection, getBook, listRevisions } from "@/lib/books/queries";
import {
  emptyTiptapDocument,
  parseTiptapDocument,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import { SECTION_TYPE_LABELS, formatNumber } from "@/lib/ui/format";

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

  const [book, revisions] = await Promise.all([
    getBook(session, bookId),
    listRevisions(session, bookId, sectionId),
  ]);

  const canEdit = canPerform(session.workspace.role, "section:update");
  const canRestore = canPerform(session.workspace.role, "revision:restore");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">
          <Link className="underline" href={`/books/${bookId}`}>
            {book?.title ?? "Libro"}
          </Link>
        </p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          {section.title}
        </h1>
        <p className="text-xs text-ink-muted">
          {SECTION_TYPE_LABELS[section.type] ?? section.type} · {formatNumber(section.wordCount)}{" "}
          palabras · versión {section.version}
        </p>

        <nav className="flex flex-wrap gap-2" aria-label="Acciones de la sección">
          <Link
            className="btn btn-ghost btn-sm"
            href={`/books/${bookId}/sections/${section.id}/history`}
          >
            Historial y comparador
          </Link>
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Manuscrito">
          <SectionEditor
            sectionId={section.id}
            sectionTitle={section.title}
            content={safeContent(section.content)}
            version={section.version}
            wordCount={section.wordCount}
            canEdit={canEdit}
          />
        </section>

        <aside className="panel p-6" aria-labelledby="revisions-title">
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
        </aside>
      </div>
    </div>
  );
}
