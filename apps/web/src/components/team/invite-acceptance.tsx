"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { acceptInvitationAction } from "@/lib/team/actions";
import { initialActionState } from "@/lib/action-state";
import { WORKSPACE_ROLE_LABELS, formatDate } from "@/lib/ui/format";

interface InviteAcceptanceProps {
  token: string;
  email: string;
  role: string;
  workspaceName: string;
  inviterName: string;
  expiresAt: Date;
  caducada: boolean;
  usada: boolean;
  tieneSesion: boolean;
  correoSesion: string | null;
}

/** Formulario de aceptación de una invitación. */
export function InviteAcceptance({
  token,
  email,
  role,
  workspaceName,
  inviterName,
  expiresAt,
  caducada,
  usada,
  tieneSesion,
  correoSesion,
}: InviteAcceptanceProps) {
  const [state, formAction] = useActionState(acceptInvitationAction, initialActionState);

  const otroCorreo =
    tieneSesion && correoSesion !== null && correoSesion.toLowerCase() !== email.toLowerCase();

  if (usada) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-ink">Invitación ya utilizada</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Esta invitación ya se ha usado o se ha revocado. Si te interesa entrar en el estudio, pide
          una invitación nueva a quien lo administra.
        </p>
      </div>
    );
  }

  if (caducada) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-ink">Invitación caducada</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Esta invitación caducó el {formatDate(expiresAt)}. Pide una nueva a quien administra el
          estudio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="eyebrow">Invitación</p>
        <h1 className="font-serif text-3xl leading-tight text-ink">
          Te han invitado a {workspaceName}
        </h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          {inviterName} te ha invitado con el rol de {WORKSPACE_ROLE_LABELS[role] ?? role}. La
          invitación caduca el {formatDate(expiresAt)}.
        </p>
      </header>

      <FormMessage state={state} />

      {otroCorreo ? (
        <p className="alert alert-error" role="alert">
          Has iniciado sesión como {correoSesion}, pero la invitación es para {email}. Entra con la
          cuenta correcta o cierra la sesión para crear la cuenta.
        </p>
      ) : null}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="token" value={token} />

        {tieneSesion ? null : (
          <>
            <TextField
              name="name"
              label="Tu nombre"
              placeholder="Cómo te firmamos"
              autoComplete="name"
              error={state.fieldErrors?.name}
            />
            <TextField
              name="password"
              label="Elige una contraseña"
              type="password"
              autoComplete="new-password"
              hint="Entre 12 y 128 caracteres. No puede contener tu nombre ni tu correo."
              error={state.fieldErrors?.password}
            />
            <p className="text-xs leading-relaxed text-ink-muted">
              Se creará la cuenta {email} y entrarás directamente al estudio.
            </p>
          </>
        )}

        <SubmitButton
          label={tieneSesion ? "Aceptar la invitación" : "Crear cuenta y entrar"}
          pendingLabel="Aceptando…"
        />
      </form>
    </div>
  );
}
