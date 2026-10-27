import {
  editorialMatterKind,
  sectionNavigationHref,
  editorialGalleryHref,
} from "@/lib/editorial/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InlineSectionTitle } from "@/components/books/inline-section-title";
import { RevisionList } from "@/components/books/revision-list";
import { SectionEditor } from "@/components/books/section-editor";
import { SectionOptionsForm } from "@/components/books/section-options-form";
import { SectionTitleForm } from "@/components/books/section-title-form";
import { SearchFragmentOnLoad } from "@/components/books/search-fragment-on-load";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { getBook, getSection, getSectionTree, listRevisions } from "@/lib/books/queries";
import { listBookAssets } from "@/lib/books/assets";
import {
  emptyTiptapDocument,
  parseTiptapDocument,
  type TiptapDocument,
} from "@escribiendo/book-schema";
import { SECTION_TYPE_LABELS, formatNumber, formatDateTime } from "@/lib/ui/format";
import { AssignSelect } from "@/components/team/assign-select";
import { listAssignableMembers } from "@/lib/team/members";
import { ManuscriptWorkspace } from "@/components/books/manuscript-workspace";

import { StudioInspector } from "@/components/books/studio-inspector";
import { StudioIcon } from "@/components/books/studio-icon";
import { listBookNotes } from "@/lib/writing/notes";
import { readingMinutes, sectionGroup } from "@/lib/books/studio";
import { flattenSectionTree } from "@/lib/books/section-tree";

export const metadata: Metadata = {
  title: "Manuscrito",
};

interface SectionPageProps {
  params: Promise<{ bookId: string; sectionId: string }>;
  searchParams: Promise<{
    find?: string;
    editLegacy?: string;
    findingStart?: string;
    findingEnd?: string;
    findingVersion?: string;
  }>;
}

/** Normaliza el contenido guardado: un documento inválido se abre vacío. */
function safeContent(value: unknown): TiptapDocument {
  try {
    return parseTiptapDocument(value);
  } catch {
    return emptyTiptapDocument;
  }
}

function parseFindingRange(
  startValue?: string,
  endValue?: string,
  versionValue?: string,
): { start: number; end: number; version: number } | null {
  if (!startValue || !endValue || !versionValue) return null;

  const start = Number(startValue);
  const end = Number(endValue);
  const version = Number(versionValue);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(version) ||
    start < 1 ||
    end <= start ||
    version < 1
  ) {
    return null;
  }

  return { start, end, version };
}

export default async function SectionPage({ params, searchParams }: SectionPageProps) {
  const session = await requireSession();
  const { bookId, sectionId } = await params;
  const { find = "", editLegacy, findingStart, findingEnd, findingVersion } = await searchParams;

  const section = await getSection(session, bookId, sectionId);

  if (!section) {
    notFound();
  }

  const matterKind = editorialMatterKind(section.type);
  if (matterKind && editLegacy !== "1" && !find) redirect(sectionNavigationHref(bookId, section));

  const [book, revisions, miembros, imagenes, sectionTree, notes] = await Promise.all([
    getBook(session, bookId),
    listRevisions(session, bookId, sectionId),
    listAssignableMembers(session),
    listBookAssets(session, bookId),
    getSectionTree(session, bookId),
    // Solo las notas de esta sección y las generales del libro: el cuaderno
    // completo se carga en su propia página.
    listBookNotes(session, bookId, section.id),
  ]);

  const canEdit = canPerform(session.workspace.role, "section:update");
  const canRestore = canPerform(session.workspace.role, "revision:restore");
  const canMove = canPerform(session.workspace.role, "section:move");

  const chapterNumber =
    flattenSectionTree(sectionTree)
      .filter((node) => node.type === "CHAPTER")
      .findIndex((node) => node.id === section.id) + 1;
  const historyHref = `/books/${bookId}/sections/${section.id}/history`;
  const findingRange = parseFindingRange(findingStart, findingEnd, findingVersion);
  return (
    <ManuscriptWorkspace
      bookId={bookId}
      nodes={sectionTree}
      activeSectionId={section.id}
      canMove={canMove}
      canDelete={canPerform(session.workspace.role, "section:delete")}
      canCreate={canPerform(session.workspace.role, "section:create")}
      editor={
        <>
          <SearchFragmentOnLoad query={find} />
          {matterKind ? (
            <p className="alert" role="status">
              Estás editando el contenido anterior de esta sección.{" "}
              <Link
                className="underline"
                href={editorialGalleryHref(bookId, matterKind, section.id)}
              >
                Abrir plantillas y vista previa
              </Link>
            </p>
          ) : null}
          <header className="studio-chapter-hero">
            <div className="studio-chapter-eyebrow">
              <span>
                {SECTION_TYPE_LABELS[section.type] ?? section.type}
                {chapterNumber > 0 ? ` ${chapterNumber}` : ""}
              </span>
              <span aria-hidden="true">/</span>
              <Link href={`/books/${bookId}`}>{sectionGroup(section.type)}</Link>
            </div>
            <InlineSectionTitle
              key={section.id}
              sectionId={section.id}
              title={section.title}
              showTitle={section.showTitle}
              showSectionType={section.showSectionType}
              showSectionNumber={section.showSectionNumber}
              canEdit={canEdit}
            />
            <p className="studio-chapter-description">
              {book?.title ?? "Libro"}
              {section.assignee ? ` · ${section.assignee.name}` : ""}
            </p>
            <div className="studio-chapter-meta">
              <span className="studio-meta-pill">
                <span className="studio-live-dot" />
                {formatNumber(section.wordCount)} palabras
              </span>
              <span className="studio-meta-pill">
                <StudioIcon name="book" />
                {readingMinutes(section.wordCount)} min de lectura
              </span>
              <Link className="studio-meta-pill" href={historyHref}>
                Versión {section.version} <span aria-hidden="true">⌄</span>
              </Link>
              <time dateTime={section.updatedAt.toISOString()}>
                Última edición: {formatDateTime(section.updatedAt)}
              </time>
              <Link
                className="studio-history-link"
                aria-label="Historial y comparador"
                href={historyHref}
              >
                <StudioIcon name="history" />
                Historial y comparar
              </Link>
              <details className="studio-hero-menu">
                <summary aria-label="Más acciones del libro">•••</summary>
                <nav>
                  <Link href={`/books/${bookId}/analysis`}>Análisis editorial</Link>
                  <Link href={`/books/${bookId}/preview`}>Vista previa</Link>
                  <Link href={`/books/${bookId}/layout`}>Maquetación</Link>
                  <Link href={editorialGalleryHref(bookId, "legal")}>Página legal e índice</Link>
                  <Link href={`/books/${bookId}/export`}>Exportar libro</Link>
                  <Link href={`/books/${bookId}`}>Gestionar secciones</Link>
                </nav>
              </details>
            </div>
          </header>
          <SectionEditor
            key={`${section.id}-${section.version}`}
            sectionId={section.id}
            sectionTitle={section.title}
            bookId={section.bookId}
            userId={session.user.id}
            content={safeContent(section.content)}
            version={section.version}
            wordCount={section.wordCount}
            canEdit={canEdit}
            bookAssets={imagenes}
            sections={flattenSectionTree(sectionTree).map((node) => ({
              id: node.id,
              title: node.title,
            }))}
            findingRange={findingRange}
          />
        </>
      }
      details={
        <StudioInspector
          bookId={bookId}
          sectionId={sectionId}
          notes={notes}
          canEdit={canEdit}
          history={
            <RevisionList
              sectionId={section.id}
              revisions={revisions.slice(0, 3)}
              currentVersion={section.version}
              canRestore={canRestore}
            />
          }
          details={
            <div className="space-y-5">
              <SectionOptionsForm sectionId={section.id} options={section} canEdit={canEdit} />
              <SectionTitleForm
                sectionId={section.id}
                title={section.title}
                showTitle={section.showTitle}
                showSectionType={section.showSectionType}
                showSectionNumber={section.showSectionNumber}
                canEdit={canEdit}
              />
              <dl className="studio-detail-list">
                <dt>Libro</dt>
                <dd>{book?.title}</dd>
                <dt>Tipo de sección</dt>
                <dd>{SECTION_TYPE_LABELS[section.type]}</dd>
                <dt>Exportación</dt>
                <dd>{section.includeInExport ? "Incluida" : "Excluida"}</dd>
              </dl>
              {canEdit ? (
                <AssignSelect
                  kind="section"
                  targetId={section.id}
                  assigneeId={section.assigneeId}
                  members={miembros}
                  label="Responsable"
                />
              ) : null}
              <p className="text-sm text-ink-muted">
                El nombre del capítulo se imprime solo, con el estilo de título de la maqueta: no
                hace falta escribirlo en el texto.
              </p>
              <Link className="btn btn-secondary btn-sm" href={`/books/${bookId}/layout`}>
                Configurar maqueta
              </Link>
            </div>
          }
        />
      }
    />
  );
}
