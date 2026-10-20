"use client";

import { useActionState } from "react";
import { restoreRevisionAction } from "@/lib/books/actions";
import { initialLibraryActionState } from "@/lib/books/action-state";
import { REVISION_REASON_LABELS, formatDateTime } from "@/lib/ui/format";
import type { RevisionSummary } from "@/lib/books/queries";

interface RevisionListProps {
  sectionId: string;
  revisions: RevisionSummary[];
  currentVersion: number;
  canRestore: boolean;
}

/**
 * Historial de revisiones de una sección.
 *
 * Las revisiones son inmutables: restaurar una versión anterior no la
 * modifica, la copia como una versión nueva. Por eso el botón dice
 * «restaurar» y no «volver atrás».
 */
export function RevisionList({
  sectionId,
  revisions,
  currentVersion,
  canRestore,
}: RevisionListProps) {
  const [state, formAction] = useActionState(restoreRevisionAction, initialLibraryActionState);

  if (revisions.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Todavía no hay revisiones. Aparecerán al guardar el manuscrito.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {state.status === "error" && state.message ? (
        <p className="alert alert-error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p className="alert alert-success" role="status">
          {state.message}
        </p>
      ) : null}

      <ol className="space-y-3">
        {revisions.map((revision) => {
          const isCurrent = revision.version === currentVersion;

          return (
            <li key={revision.id} className="timeline-row">
              <span
                className={`timeline-number ${isCurrent ? "timeline-number-current" : ""}`}
                aria-hidden="true"
              >
                {revision.version}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {REVISION_REASON_LABELS[revision.reason] ?? revision.reason}
                  {isCurrent ? (
                    <span className="ml-2 text-[0.62rem] font-semibold uppercase tracking-wider text-accent">
                      Actual
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {revision.createdBy.name} · {formatDateTime(revision.createdAt)} ·{" "}
                  {revision.wordCount} palabras
                </p>
              </div>

              {canRestore && !isCurrent ? (
                <form action={formAction}>
                  <input type="hidden" name="sectionId" value={sectionId} />
                  <input type="hidden" name="revisionId" value={revision.id} />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    Restaurar
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
