import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ChangePasswordForm,
  ProfileForm,
  RevokeOtherSessionsForm,
} from "@/components/account/account-forms";
import { ShieldIcon } from "@/components/icons";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  describeUserAgent,
  formatDate,
  formatDateTime,
  getInitials,
  USER_ROLE_LABELS,
  WORKSPACE_ROLE_LABELS,
} from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Mi cuenta",
};

function sessionState(input: { revokedAt: Date | null; expiresAt: Date }, now: Date): string {
  if (input.revokedAt) {
    return "Cerrada";
  }

  return input.expiresAt <= now ? "Caducada" : "Activa";
}

export default async function AccountPage() {
  const session = await requireSession();

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  if (!account) {
    redirect("/login");
  }

  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      userAgent: true,
    },
  });

  const now = new Date();
  const activeSessions = sessions.filter(
    (entry) => !entry.revokedAt && entry.expiresAt > now,
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="eyebrow">Cuenta y seguridad</p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.03] text-ink">
          Mi cuenta
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Datos de identidad, contraseña y sesiones abiertas. Los cambios quedan registrados en la
          auditoría del espacio de trabajo.
        </p>
      </header>

      <section className="panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <span className="avatar size-16 text-xl" aria-hidden="true">
          {getInitials(account.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-2xl text-ink">{account.name}</h2>
          <p className="truncate text-sm text-ink-muted">{account.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="phase-chip phase-chip-static">
              {USER_ROLE_LABELS[account.role] ?? account.role}
            </span>
            <span className="phase-chip phase-chip-static">
              {WORKSPACE_ROLE_LABELS[session.workspace.role] ?? session.workspace.role}
            </span>
            <span className="phase-chip phase-chip-static">{activeSessions} sesiones activas</span>
          </div>
        </div>
        <dl className="grid shrink-0 gap-3 text-xs sm:text-right">
          <div>
            <dt className="meta-label">Cuenta creada</dt>
            <dd className="mt-0.5 text-ink-soft">{formatDate(account.createdAt)}</dd>
          </div>
          <div>
            <dt className="meta-label">Último acceso</dt>
            <dd className="mt-0.5 text-ink-soft">
              {account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Sin registrar"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6" aria-labelledby="profile-title">
          <p className="meta-label">Identidad</p>
          <h2 id="profile-title" className="mt-1.5 font-serif text-2xl text-ink">
            Datos del perfil
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            El nombre visible aparece en la navegación y en la autoría de las revisiones.
          </p>
          <div className="mt-5">
            <ProfileForm name={account.name} email={account.email} />
          </div>
        </section>

        <section className="panel p-6" aria-labelledby="password-title">
          <p className="meta-label">Seguridad</p>
          <h2 id="password-title" className="mt-1.5 font-serif text-2xl text-ink">
            Cambiar contraseña
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Se aplica Argon2id. Las demás sesiones se revocan automáticamente al guardar.
          </p>
          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </section>
      </div>

      <section className="panel p-6" aria-labelledby="sessions-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="meta-label">Sesiones</p>
            <h2 id="sessions-title" className="mt-1.5 font-serif text-2xl text-ink">
              Dispositivos con acceso
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
              Se muestran las últimas diez sesiones. Solo se conserva un hash de la IP; nunca la
              dirección original.
            </p>
          </div>
          {activeSessions > 1 ? <RevokeOtherSessionsForm /> : null}
        </div>

        <div className="mt-5">
          {sessions.map((entry) => {
            const isCurrent = entry.id === session.sessionId;
            const state = sessionState(entry, now);

            return (
              <div className="timeline-row" key={entry.id}>
                <span
                  className={`timeline-number ${state === "Activa" ? "timeline-number-current" : ""}`}
                  aria-hidden="true"
                >
                  <ShieldIcon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {describeUserAgent(entry.userAgent)}
                    {isCurrent ? (
                      <span className="ml-2 text-[0.62rem] font-semibold uppercase tracking-wider text-accent">
                        Esta sesión
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Iniciada {formatDateTime(entry.createdAt)} · Último uso{" "}
                    {formatDateTime(entry.lastUsedAt)}
                  </p>
                </div>
                <span
                  className={`text-right text-xs ${
                    state === "Activa" ? "text-success" : "text-ink-muted"
                  }`}
                >
                  {state}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Si detectas una sesión que no reconoces, cambia la contraseña y cierra las demás sesiones.
          Las sesiones caducan automáticamente según{" "}
          <code className="font-mono">SESSION_TTL_DAYS</code>.
        </p>
      </section>
    </div>
  );
}
