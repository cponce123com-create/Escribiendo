"use client";

import { useActionState } from "react";
import { revokeInvitationAction } from "@/lib/team/actions";
import { initialActionState } from "@/lib/action-state";
import { WORKSPACE_ROLE_LABELS, formatDate } from "@/lib/ui/format";
import type { InvitationSummary } from "@/lib/team/members";

const STATE_LABELS: Record<InvitationSummary["state"], string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  revoked: "Revocada",
  expired: "Caducada",
};

/** Invitaciones del estudio. */
export function InvitationList({ invitations }: { invitations: InvitationSummary[] }) {
  if (invitations.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        No hay invitaciones. Crea una arriba para dar acceso a otra persona.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{invitation.email}</p>
            <p className="text-xs text-ink-muted">
              {WORKSPACE_ROLE_LABELS[invitation.role] ?? invitation.role} ·{" "}
              {STATE_LABELS[invitation.state]} · creada {formatDate(invitation.createdAt)} por{" "}
              {invitation.invitedByName}
            </p>
          </div>

          {invitation.state === "pending" ? <RevokeButton invitationId={invitation.id} /> : null}
        </li>
      ))}
    </ul>
  );
}

function RevokeButton({ invitationId }: { invitationId: string }) {
  const [state, formAction] = useActionState(revokeInvitationAction, initialActionState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button type="submit" className="btn btn-ghost btn-sm">
        Revocar
      </button>
      {state.status === "error" && state.message ? (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
