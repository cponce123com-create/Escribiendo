import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { SetupForm } from "@/components/auth/auth-forms";
import { LockIcon } from "@/components/icons";
import { getSession, hasAnyUser } from "@/lib/auth/session";
import { isSetupTokenConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Instalación inicial",
};

export default async function SetupPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  if (await hasAnyUser()) {
    redirect("/login");
  }

  const tokenConfigured = isSetupTokenConfigured();

  return (
    <>
      <AuthHeading
        eyebrow="Instalación · Una sola vez"
        title="Crear la primera cuenta"
        description="Esta cuenta será la propietaria del primer espacio de trabajo y recibirá el rol de superadministración. Solo puede existir una instalación inicial."
      />

      {tokenConfigured ? (
        <SetupForm tokenConfigured />
      ) : (
        <div className="panel space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
              <LockIcon className="size-4" />
            </span>
            <div>
              <h2 className="font-serif text-xl">Instalación deshabilitada</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                No hay ninguna cuenta, pero el servidor no tiene un token de instalación válido.
                Define <code className="font-mono text-[0.78rem]">SETUP_TOKEN</code> con al menos 32
                caracteres aleatorios, reinicia la aplicación y vuelve a esta página.
              </p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            El token se valida en el servidor y no se conserva en la base de datos. Consulta
            <span className="font-medium text-ink-soft"> docs/DEPLOYMENT.md </span>
            para el procedimiento completo.
          </p>
          <Link className="btn btn-secondary btn-sm" href="/login">
            Volver al acceso
          </Link>
        </div>
      )}
    </>
  );
}
