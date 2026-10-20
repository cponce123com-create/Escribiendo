"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { createInvitationAction, type TeamActionState } from "@/lib/team/actions";
import { initialActionState } from "@/lib/action-state";

/**
 * Formulario de invitación.
 *
 * La aplicación no envía correo, de modo que el enlace de invitación se
 * muestra aquí **una sola vez**, justo después de crearla. Quien administra
 * lo comparte por el medio que prefiera; después ya no se puede recuperar.
 */
export function InviteForm() {
  const [state, formAction] = useActionState<TeamActionState, FormData>(
    createInvitationAction,
    initialActionState,
  );

  const enlace = state.invitationUrl
    ? `${typeof window === "undefined" ? "" : window.location.origin}${state.invitationUrl}`
    : null;

  return (
    <div className="space-y-5">
      <FormMessage state={state} />

      <form action={formAction} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="email"
            label="Correo de la persona"
            type="email"
            placeholder="persona@ejemplo.local"
            autoComplete="off"
            error={state.fieldErrors?.email}
          />

          <div>
            <label className="field-label" htmlFor="invite-role">
              Rol
            </label>
            <select id="invite-role" name="role" className="field-input" defaultValue="AUTHOR">
              <option value="ADMIN">Administración</option>
              <option value="EDITOR">Edición</option>
              <option value="AUTHOR">Autoría</option>
              <option value="REVIEWER">Revisión</option>
            </select>
            <p className="field-hint">
              Quien edita escribe el manuscrito; quien revisa solo lee y comenta.
            </p>
          </div>
        </div>

        <SubmitButton label="Crear invitación" pendingLabel="Creando…" />
      </form>

      {enlace ? (
        <div className="rounded-sm border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-medium text-ink">Invitación para {state.invitationEmail}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Este enlace no se vuelve a mostrar. Cópialo ahora.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-sm bg-ink/5 p-2 text-xs">
            {enlace}
          </code>
        </div>
      ) : null}
    </div>
  );
}
