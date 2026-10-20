"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createCommentAction,
  reopenCommentAction,
  resolveCommentAction,
} from "@/lib/review/actions";
import { initialActionState } from "@/lib/action-state";
import type { EditorialCommentSummary } from "@/lib/review/comments";
import { formatDateTime } from "@/lib/ui/format";

interface CommentPanelProps {
  bookId: string;
  sections: Array<{ id: string; title: string }>;
  comments: EditorialCommentSummary[];
  canComment: boolean;
}

/**
 * Comentarios editoriales del libro.
 *
 * Son visibles para todo el espacio de trabajo: sirven para que la edición
 * se comunique con la autoría.
 */
export function CommentPanel({ bookId, sections, comments, canComment }: CommentPanelProps) {
  const [state, formAction] = useActionState(createCommentAction, initialActionState);
  const [resolveState, resolveAction] = useActionState(resolveCommentAction, initialActionState);
  const [reopenState, reopenAction] = useActionState(reopenCommentAction, initialActionState);

  const open = comments.filter((comment) => comment.status === "OPEN");
  const resolved = comments.filter((comment) => comment.status === "RESOLVED");

  return (
    <div className="space-y-6">
      <FormMessage state={state} />
      {/* El estado vive en el panel: al resolver un comentario la tarjeta
          cambia de lista, y el mensaje no debe desaparecer con ella. */}
      <FormMessage state={resolveState} />
      <FormMessage state={reopenState} />

      <section aria-label="Comentarios sin resolver">
        <h3 className="font-serif text-xl text-ink">
          Sin resolver <span className="text-sm text-ink-muted">({open.length})</span>
        </h3>

        {open.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            No hay comentarios pendientes. El libro está listo para aprobarse.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {open.map((comment) => (
              <li key={comment.id} className="panel p-5">
                <CommentBody comment={comment} />
                <ResolveButton comment={comment} label="Resolver" action={resolveAction} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 ? (
        <section aria-label="comentarios resueltos">
          <h3 className="font-serif text-xl text-ink">
            Resueltos <span className="text-sm text-ink-muted">({resolved.length})</span>
          </h3>
          <ul className="mt-3 space-y-3">
            {resolved.map((comment) => (
              <li key={comment.id} className="panel p-5 opacity-80">
                <CommentBody comment={comment} />
                <ResolveButton comment={comment} label="Reabrir" action={reopenAction} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canComment ? (
        <section className="panel p-6" aria-label="nuevo comentario">
          <h3 className="font-serif text-xl text-ink">Nuevo comentario</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Visible para el espacio de trabajo. Ancla el comentario en una sección cuando el
            comentario sea sobre un fragmento concreto.
          </p>

          <form action={formAction} className="mt-5 space-y-5">
            <input type="hidden" name="bookId" value={bookId} />

            {sections.length > 0 ? (
              <div>
                <label className="field-label" htmlFor="comment-section">
                  Sección
                </label>
                <select
                  id="comment-section"
                  name="sectionId"
                  className="field-input"
                  defaultValue=""
                >
                  <option value="">Sin sección concreta</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="field-label" htmlFor="comment-body">
                Comentario
              </label>
              <textarea
                id="comment-body"
                name="body"
                className="field-input min-h-24"
                placeholder="Qué hay que revisar y por qué."
                aria-describedby="comment-body-hint"
              />
              <p className="field-hint" id="comment-body-hint">
                {state.fieldErrors?.body ?? "Máximo 10 000 caracteres."}
              </p>
            </div>

            <SubmitButton label="Publicar comentario" pendingLabel="Publicando…" />
          </form>
        </section>
      ) : null}
    </div>
  );
}

function CommentBody({ comment }: { comment: EditorialCommentSummary }) {
  return (
    <>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{comment.body}</p>
      <p className="mt-3 text-xs text-ink-muted">
        {comment.author.name} · {formatDateTime(comment.createdAt)}
        {comment.sectionTitle ? ` · «${comment.sectionTitle}»` : ""}
        {comment.resolvedBy && comment.resolvedAt
          ? ` · resuelto por ${comment.resolvedBy.name}`
          : ""}
      </p>
    </>
  );
}

function ResolveButton({
  comment,
  label,
  action,
}: {
  comment: EditorialCommentSummary;
  label: string;
  action: (payload: FormData) => void;
}) {
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="commentId" value={comment.id} />
      <button type="submit" className="btn btn-ghost btn-sm">
        {label}
      </button>
    </form>
  );
}
