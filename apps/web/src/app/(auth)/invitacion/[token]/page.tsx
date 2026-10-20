import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteAcceptance } from "@/components/team/invite-acceptance";
import { hashToken } from "@/lib/auth/tokens";
import { findInvitationByToken } from "@/lib/team/members";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Invitación al estudio",
};

interface InvitationPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Aceptación de una invitación.
 *
 * La página es pública: quien recibe el enlace puede no tener cuenta. Si ya
 * tiene sesión, se le añade al estudio; si no, se le crea la cuenta con la
 * política de contraseñas de la aplicación.
 */
export default async function InvitationPage({ params }: InvitationPageProps) {
  const { token } = await params;

  if (!token || token.length < 20) {
    notFound();
  }

  const [invitation, session] = await Promise.all([
    findInvitationByToken(hashToken(token)),
    getSession(),
  ]);

  if (!invitation) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-ink">Invitación no válida</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Este enlace no corresponde a ninguna invitación. Puede que ya se haya usado o que se haya
          revocado.
        </p>
      </div>
    );
  }

  const caducada = invitation.expiresAt.getTime() < new Date().getTime();
  const usada = Boolean(invitation.acceptedAt) || Boolean(invitation.revokedAt);

  return (
    <InviteAcceptance
      token={token}
      email={invitation.email}
      role={invitation.role}
      workspaceName={invitation.workspaceName}
      inviterName={invitation.inviterName}
      expiresAt={invitation.expiresAt}
      caducada={caducada}
      usada={usada}
      tieneSesion={Boolean(session)}
      correoSesion={session?.user.email ?? null}
    />
  );
}
