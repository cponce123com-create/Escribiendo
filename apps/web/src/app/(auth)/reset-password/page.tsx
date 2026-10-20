import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AlertIcon, LockIcon } from "@/components/icons";
import { inspectPasswordResetToken, isResetTokenWellFormed } from "@/lib/auth/password-reset";

export const metadata: Metadata = {
  title: "Restablecer contraseña",
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = typeof rawToken === "string" ? rawToken : "";
  const tokenInfo = isResetTokenWellFormed(token)
    ? await inspectPasswordResetToken(token)
    : { valid: false };

  if (!tokenInfo.valid) {
    return (
      <>
        <AuthHeading
          eyebrow="Enlace de recuperación"
          title="Este enlace no es válido"
          description="Puede haber caducado, haberse usado ya o no pertenecer a ninguna cuenta activa. Por seguridad no indicamos cuál de esas circunstancias ocurre."
        />
        <div className="panel space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
              <AlertIcon className="size-4" />
            </span>
            <p className="text-sm leading-relaxed text-ink-soft">
              Solicita a la administración del estudio un enlace nuevo. Los enlaces se emiten desde
              el servidor con{" "}
              <code className="font-mono text-[0.78rem]">pnpm admin:password-reset</code> y caducan
              en pocas horas.
            </p>
          </div>
          <Link className="btn btn-secondary btn-sm" href="/login">
            Volver al acceso
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        eyebrow="Enlace de recuperación"
        title="Elige una contraseña nueva"
        description={`Enlace válido para ${tokenInfo.userName ?? "tu cuenta"}. Al guardar la contraseña se cerrarán todas las sesiones abiertas.`}
      />

      <div className="alert alert-info mb-6">
        <LockIcon />
        <span>
          El enlace es de un solo uso. No lo compartas ni lo guardes en el historial del navegador
          si el equipo es compartido.
        </span>
      </div>

      <ResetPasswordForm token={token} />

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
        Si no has solicitado este cambio, cierra esta página y avisa a la administración.
      </p>
    </>
  );
}
