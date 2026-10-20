import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { InviteForm } from "@/components/team/invite-form";
import { InvitationList } from "@/components/team/invitation-list";
import { MemberList } from "@/components/team/member-list";
import { listInvitations, listMembers } from "@/lib/team/members";

export const metadata: Metadata = {
  title: "Equipo",
};

export default async function TeamPage() {
  const session = await requireSession();

  const [members, invitations] = await Promise.all([
    listMembers(session),
    listInvitations(session),
  ]);

  const canManage = canPerform(session.workspace.role, "team:manage");
  const canExportAudit = canPerform(session.workspace.role, "audit:export");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Estudio</p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Equipo
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Quién tiene acceso a {session.workspace.name} y con qué permisos. Los roles se comprueban
          en el servidor en cada operación: la interfaz solo los muestra.
        </p>
      </header>

      <section className="panel p-6" aria-label="miembros del estudio">
        <p className="meta-label">Miembros</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Personas con acceso</h2>

        <div className="mt-5">
          <MemberList members={members} canManage={canManage} currentUserId={session.user.id} />
        </div>
      </section>

      {canManage ? (
        <section className="panel p-6" aria-label="invitar a una persona">
          <p className="meta-label">Invitaciones</p>
          <h2 className="mt-1.5 font-serif text-2xl text-ink">Dar acceso</h2>
          <p className="mt-2 mb-5 text-sm leading-relaxed text-ink-muted">
            La aplicación no envía correo: se crea la invitación y se comparte el enlace por el
            medio que prefieras. El enlace caduca en catorce días y se puede revocar.
          </p>

          <InviteForm />
        </section>
      ) : null}

      <section className="panel p-6" aria-label="invitaciones">
        <p className="meta-label">Historial</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Invitaciones</h2>

        <div className="mt-5">
          <InvitationList invitations={invitations} />
        </div>
      </section>

      {canExportAudit ? (
        <section className="panel p-6" aria-label="auditoría">
          <p className="meta-label">Trazabilidad</p>
          <h2 className="mt-1.5 font-serif text-2xl text-ink">Registro de auditoría</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Cada acción con efecto sobre el estudio queda registrada: quién la hizo, qué hizo y
            cuándo. El registro no contiene contenido de manuscritos, contraseñas ni tokens.
          </p>
          <div className="mt-4">
            <a className="btn btn-secondary" href="/api/audit/export?format=csv">
              Exportar el registro (CSV)
            </a>
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-ink-muted">
        Los datos personales se guardan mientras el estudio exista. La{" "}
        <Link className="underline" href="/account">
          cuenta
        </Link>{" "}
        permite revisar y exportar lo tuyo.
      </p>
    </div>
  );
}
