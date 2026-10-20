import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { DatabaseProblem } from "@/components/auth/database-problem";
import { LoginForm } from "@/components/auth/auth-forms";
import { CheckIcon } from "@/components/icons";
import { getDatabaseState } from "@/lib/auth/installation";
import { getSession } from "@/lib/auth/session";
import { isSetupTokenConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Acceso privado",
};

interface LoginPageProps {
  searchParams: Promise<{ reset?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  // El estado de la base de datos se comprueba antes que la sesión: si la
  // base no responde, la consulta de sesión también fallaría y el error
  // llegaría al límite genérico, sin diagnóstico.
  const database = await getDatabaseState();

  if (database.status !== "ready") {
    const headerStore = await headers();

    return (
      <>
        <AuthHeading
          eyebrow="Acceso privado"
          title="El acceso no está disponible"
          description="La aplicación se ha desplegado correctamente, pero no puede completar las consultas que necesita para autenticar a una cuenta."
        />

        <DatabaseProblem state={database} requestId={headerStore.get("x-request-id")} />
      </>
    );
  }

  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const setupAvailable = !database.hasUsers && isSetupTokenConfigured();

  return (
    <>
      <AuthHeading
        eyebrow="Acceso privado"
        title="Entrar en el estudio"
        description="Introduce las credenciales de tu cuenta. Cada sesión queda registrada en la auditoría del espacio de trabajo."
      />

      {params.reset === "1" ? (
        <div className="alert alert-success mb-6" role="status">
          <CheckIcon />
          <span>Contraseña restablecida. Ya puedes entrar con tus credenciales nuevas.</span>
        </div>
      ) : null}

      {!database.hasUsers ? (
        <div className="alert alert-info mb-6">
          <span>
            La instalación todavía no tiene ninguna cuenta.{" "}
            {setupAvailable ? (
              <>
                <Link className="font-semibold text-accent underline" href="/setup">
                  Crea la primera cuenta
                </Link>{" "}
                con el token de instalación.
              </>
            ) : (
              <>
                Configura <code className="font-mono text-[0.78rem]">SETUP_TOKEN</code> en el
                servidor para habilitar la creación de la primera cuenta.
              </>
            )}
          </span>
        </div>
      ) : null}

      <LoginForm />

      <div className="rule my-7" />

      <p className="text-center text-xs leading-relaxed text-ink-muted">
        ¿Has olvidado la contraseña? La administración del estudio puede emitir un enlace de
        recuperación de un solo uso. No se envían correos automáticos en esta fase.
      </p>
    </>
  );
}
