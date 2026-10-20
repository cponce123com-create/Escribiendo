"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  revokeOtherSessionsAction,
  updateProfileAction,
} from "@/lib/auth/actions";
import { initialPasswordActionState } from "@/lib/auth/action-state";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";

interface ProfileFormProps {
  name: string;
  email: string;
}

export function ProfileForm({ name, email }: ProfileFormProps) {
  const [state, formAction] = useActionState(updateProfileAction, initialPasswordActionState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <TextField
        name="name"
        label="Nombre visible"
        autoComplete="name"
        defaultValue={name}
        error={state.fieldErrors?.name}
      />
      <div>
        <label className="field-label" htmlFor="profile-email">
          Correo electrónico
        </label>
        <input
          id="profile-email"
          className="field-input"
          type="email"
          value={email}
          readOnly
          disabled
          aria-describedby="profile-email-hint"
        />
        <p className="field-hint" id="profile-email-hint">
          El correo identifica la cuenta y no se puede cambiar desde la interfaz. La administración
          debe hacerlo en la base de datos si fuera necesario.
        </p>
      </div>
      <SubmitButton label="Guardar datos" pendingLabel="Guardando…" className="btn btn-secondary" />
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialPasswordActionState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <PasswordField
        name="currentPassword"
        label="Contraseña actual"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />
      <PasswordField
        name="newPassword"
        label="Contraseña nueva"
        autoComplete="new-password"
        hint="Entre 12 y 128 caracteres. No puede coincidir con la actual."
        error={state.fieldErrors?.newPassword}
      />
      <PasswordField
        name="confirmPassword"
        label="Repite la contraseña nueva"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton
        label="Cambiar contraseña"
        pendingLabel="Cambiando…"
        className="btn btn-secondary"
      />
      <p className="field-hint">
        Al cambiarla se cerrarán las demás sesiones. Esta sesión permanece abierta.
      </p>
    </form>
  );
}

export function RevokeOtherSessionsForm() {
  const [state, formAction] = useActionState(revokeOtherSessionsAction, initialPasswordActionState);

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton
        label="Cerrar las demás sesiones"
        pendingLabel="Cerrando…"
        className="btn btn-danger btn-sm"
      />
    </form>
  );
}
