"use client";

import { useActionState } from "react";
import { switchWorkspaceAction, type TeamActionState } from "@/lib/team/actions";
import type { ActiveWorkspace } from "@/lib/auth/session";
import { WORKSPACE_ROLE_LABELS } from "@/lib/ui/format";

const ESTADO_INICIAL: TeamActionState = { status: "idle" };

interface WorkspaceSwitcherProps {
  /** Estudio activo. */
  activo: ActiveWorkspace;
  /** Todos los estudios de la persona. */
  estudios: ActiveWorkspace[];
}

/**
 * Selector de espacio de trabajo.
 *
 * Una persona puede trabajar en varios estudios. El que está activo es el que
 * guarda la sesión, así que cambiarlo afecta a todo lo que se ve: los libros,
 * el equipo y la auditoría.
 */
export function WorkspaceSwitcher({ activo, estudios }: WorkspaceSwitcherProps) {
  const [state, formAction] = useActionState(switchWorkspaceAction, ESTADO_INICIAL);

  if (estudios.length < 2) {
    return null;
  }

  return (
    <form action={formAction} className="mt-3">
      <label className="sr-only" htmlFor="workspace-switcher">
        Cambiar de espacio de trabajo
      </label>
      <select
        id="workspace-switcher"
        name="workspaceId"
        className="field-input text-sm"
        defaultValue={activo.id}
        aria-label="Cambiar de espacio de trabajo"
      >
        {estudios.map((estudio) => (
          <option key={estudio.id} value={estudio.id}>
            {estudio.name} — {WORKSPACE_ROLE_LABELS[estudio.role] ?? estudio.role}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-ghost btn-sm mt-2 w-full justify-start">
        Cambiar de estudio
      </button>
      {state.status === "error" && state.message ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p className="mt-1 text-xs text-success" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
