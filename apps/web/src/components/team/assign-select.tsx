"use client";

import { useActionState } from "react";
import { assignCommentAction, assignSectionAction } from "@/lib/team/assignments";
import { initialActionState } from "@/lib/action-state";

interface AssignSelectProps {
  /** Identificador de la sección o del comentario. */
  targetId: string;
  /** Persona a la que está asignado ahora mismo, si hay alguna. */
  assigneeId: string | null;
  /** Miembros que pueden recibir el trabajo. */
  members: Array<{ userId: string; name: string }>;
  /** `section` o `comment`: decide la acción. */
  kind: "section" | "comment";
  /** Etiqueta del control. */
  label: string;
}

/**
 * Selector de persona asignada.
 *
 * Solo ofrece a personas del estudio: el servidor lo comprueba de nuevo,
 * pero la interfaz tampoco debe ofrecer lo que no es válido.
 */
export function AssignSelect({ targetId, assigneeId, members, kind, label }: AssignSelectProps) {
  const [state, formAction] = useActionState(
    kind === "section" ? assignSectionAction : assignCommentAction,
    initialActionState,
  );

  const inputId = `asignar-${kind}-${targetId}`;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name={kind === "section" ? "sectionId" : "commentId"} value={targetId} />

      <div>
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        <select
          id={inputId}
          name="assigneeId"
          className="field-input"
          defaultValue={assigneeId ?? ""}
        >
          <option value="">Sin asignar</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn-ghost btn-sm">
        Asignar
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
