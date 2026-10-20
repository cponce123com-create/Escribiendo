import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { WorkspaceRole } from "@escribiendo/database";

/**
 * Miembros del estudio e invitaciones.
 *
 * Todo se filtra por el espacio de trabajo de la sesión: una consulta que no
 * lo haga permitiría ver personas de otro estudio.
 */

export interface MemberSummary {
  /** Identificador de la pertenencia. */
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  /** La persona que creó el estudio. */
  isOwner: boolean;
  joinedAt: Date;
  lastLoginAt: Date | null;
  /** Libros de los que es responsable. */
  books: number;
  /** Secciones que tiene asignadas. */
  assignedSections: number;
  /** Comentarios que tiene asignados. */
  assignedComments: number;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  invitedByName: string;
  /** Estado calculado: pendiente, aceptada, revocada o caducada. */
  state: "pending" | "accepted" | "revoked" | "expired";
}

/** Miembros del espacio de trabajo. */
export async function listMembers(session: SessionContext): Promise<MemberSummary[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: session.workspace.id },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          lastLoginAt: true,
          _count: {
            select: {
              booksCreated: true,
              sectionsAssigned: true,
              commentsAssigned: true,
            },
          },
        },
      },
    },
  });

  const ownerId = await prisma.workspace.findFirst({
    where: { id: session.workspace.id },
    select: { ownerId: true },
  });

  return members.map((member) => ({
    membershipId: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    isOwner: member.user.id === ownerId?.ownerId,
    joinedAt: member.createdAt,
    lastLoginAt: member.user.lastLoginAt,
    books: member.user._count.booksCreated,
    assignedSections: member.user._count.sectionsAssigned,
    assignedComments: member.user._count.commentsAssigned,
  }));
}

/** Invitaciones del espacio de trabajo. */
export async function listInvitations(session: SessionContext): Promise<InvitationSummary[]> {
  const invitations = await prisma.workspaceInvitation.findMany({
    where: { workspaceId: session.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
  });

  const ahora = Date.now();

  return invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
    invitedByName: invitation.invitedBy.name,
    state: invitation.acceptedAt
      ? "accepted"
      : invitation.revokedAt
        ? "revoked"
        : invitation.expiresAt.getTime() < ahora
          ? "expired"
          : "pending",
  }));
}

/** Una invitación por su token, para la página de aceptación. */
export async function findInvitationByToken(tokenHash: string): Promise<{
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  workspaceName: string;
  workspaceId: string;
  inviterName: string;
} | null> {
  const invitation = await prisma.workspaceInvitation.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedBy: { select: { name: true } },
      workspace: { select: { id: true, name: true } },
    },
  });

  if (!invitation) {
    return null;
  }

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    workspaceName: invitation.workspace.name,
    workspaceId: invitation.workspace.id,
    inviterName: invitation.invitedBy.name,
  };
}
