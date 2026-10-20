"use client";

import { useActionState } from "react";
import { loginAction, resetPasswordAction, setupAction } from "@/lib/auth/actions";
import { initialAuthActionState } from "@/lib/auth/action-state";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialAuthActionState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <TextField
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="username"
        placeholder="nombre@ejemplo.com"
        error={state.fieldErrors?.email}
      />
      <PasswordField
        name="password"
        label="Contraseña"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <SubmitButton label="Entrar en el estudio" pendingLabel="Comprobando…" />
      <p className="field-hint text-center">
        El acceso es privado. Las cuentas las crea la administración del estudio.
      </p>
    </form>
  );
}

interface SetupFormProps {
  tokenConfigured: boolean;
}

export function SetupForm({ tokenConfigured }: SetupFormProps) {
  const [state, formAction] = useActionState(setupAction, initialAuthActionState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <TextField
        name="setupToken"
        label="Token de instalación"
        type="password"
        autoComplete="off"
        placeholder="Pega el token de SETUP_TOKEN"
        hint={
          tokenConfigured
            ? "Token de un solo uso definido en el servidor. Se elimina del entorno tras la instalación."
            : "El servidor no tiene SETUP_TOKEN configurado."
        }
        error={state.fieldErrors?.setupToken}
        required
      />
      <TextField
        name="name"
        label="Nombre"
        autoComplete="name"
        placeholder="Nombre y apellidos"
        error={state.fieldErrors?.name}
      />
      <TextField
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="username"
        placeholder="nombre@ejemplo.com"
        hint="Se normaliza a minúsculas. No hay registro público."
        error={state.fieldErrors?.email}
      />
      <PasswordField
        name="password"
        label="Contraseña"
        autoComplete="new-password"
        hint="Entre 12 y 128 caracteres. No uses tu nombre ni tu correo."
        error={state.fieldErrors?.password}
      />
      <PasswordField
        name="confirmPassword"
        label="Repite la contraseña"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton label="Crear cuenta y entrar" pendingLabel="Creando el estudio…" />
    </form>
  );
}

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction] = useActionState(resetPasswordAction, initialAuthActionState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label="Contraseña nueva"
        autoComplete="new-password"
        hint="Entre 12 y 128 caracteres. Al guardarla se cerrarán todas tus sesiones."
        error={state.fieldErrors?.password}
      />
      <PasswordField
        name="confirmPassword"
        label="Repite la contraseña nueva"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton label="Guardar contraseña" pendingLabel="Guardando…" />
    </form>
  );
}
