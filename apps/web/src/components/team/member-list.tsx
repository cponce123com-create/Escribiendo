"use client";

import { useActionState } from "react";
import { changeMemberRoleAction, removeMemberAction } from "@/lib/team/actions";
import { initialActionState } from "@/lib/action-state";
import { WORKSPACE_ROLE_LABELS } from "@/lib/ui/format";
import { formatDate } from "@/lib/ui/format";
import type { MemberSummary } from "@/lib/team/members";

interface MemberListProps {
  members: MemberSummary[];
  /** Si la persona que mira la lista puede gestionarla. */
  canManage: boolean;
  /** La cuenta que está mirando la lista. */
  currentUserId: string;
}

/** Miembros del estudio, con su rol y su trabajo asignado. */
export function MemberList({ members, canManage, currentUserId }: MemberListProps) {
  return (
    <ul className="space-y-3">
      {members.map((member) => (
        <li key={member.membershipId} className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-lg text-ink">
                {member.name}
                {member.userId === currentUserId ? (
                  <span className="ml-2 text-xs text-ink-muted">(tú)</span>
                ) : null}
                {member.isOwner ? (
                  <span className="ml-2 text-[0.62rem] uppercase tracking-wider text-accent">
                    propiedad
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">{member.email}</p>
              <p className="mt-2 text-xs text-ink-muted">
                {member.books} {member.books === 1 ? "libro" : "libros"} · {member.assignedSections}{" "}
                secciones asignadas · {member.assignedComments} comentarios asignados
                {member.lastLoginAt
                  ? ` · último acceso ${formatDate(member.lastLoginAt)}`
                  : " · sin accesos registrados"}
              </p>
            </div>

            {canManage && !member.isOwner ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <RoleSelector
                  userId={member.userId}
                  role={member.role}
                  disabled={member.userId === currentUserId}
                />
                {member.userId === currentUserId ? null : (
                  <RemoveButton userId={member.userId} name={member.name} />
                )}
              </div>
            ) : (
              <p className="shrink-0 text-xs text-ink-muted">
                {WORKSPACE_ROLE_LABELS[member.role] ?? member.role}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RoleSelector({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(changeMemberRoleAction, initialActionState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label className="field-label" htmlFor={`rol-${userId}`}>
          Rol
        </label>
        <select
          id={`rol-${userId}`}
          name="role"
          className="field-input"
          defaultValue={role}
          disabled={disabled}
        >
          <option value="ADMIN">Administración</option>
          <option value="EDITOR">Edición</option>
          <option value="AUTHOR">Autoría</option>
          <option value="REVIEWER">Revisión</option>
        </select>
      </div>
      <button type="submit" className="btn btn-ghost btn-sm" disabled={disabled}>
        Guardar
      </button>
      {state.status !== "idle" && state.message ? (
        <span
          className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function RemoveButton({ userId, name }: { userId: string; name: string }) {
  const [state, formAction] = useActionState(removeMemberAction, initialActionState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" className="btn btn-ghost btn-sm" title={`Retirar a ${name}`}>
        Retirar
      </button>
      {state.status === "error" && state.message ? (
        <span className="text-xs text-danger" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
