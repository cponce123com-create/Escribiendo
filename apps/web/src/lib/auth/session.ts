import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole, WorkspaceRole } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { esEsquemaDesactualizado } from "@escribiendo/database";
import { ConfigurationError } from "@/lib/errors";
import { getRequestContext, type RequestContext } from "@/lib/security/request-context";
import { getServerEnv, getSessionTtlMs, isProduction } from "@/lib/env";
import { generateToken, hashToken } from "./tokens";

const SESSION_COOKIE_PRODUCTION = "__Host-escribiendo_session";
const SESSION_COOKIE_DEVELOPMENT = "escribiendo_session";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ActiveWorkspace {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface SessionContext {
  sessionId: string;
  user: AuthenticatedUser;
  workspace: ActiveWorkspace;
  /** Todos los estudios a los que pertenece la persona. */
  workspaces: ActiveWorkspace[];
}

function sessionCookieName(): string {
  return isProduction() ? SESSION_COOKIE_PRODUCTION : SESSION_COOKIE_DEVELOPMENT;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(getSessionTtlMs() / 1_000),
  };
}

export async function createSession(
  userId: string,
  requestContext?: RequestContext,
  workspaceId?: string,
): Promise<void> {
  const context = requestContext ?? (await getRequestContext());
  const token = generateToken();
  const expiresAt = new Date(Date.now() + getSessionTtlMs());
  const cookieStore = await cookies();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      ...(workspaceId ? { workspaceId } : {}),
    },
  });

  cookieStore.set(sessionCookieName(), token, sessionCookieOptions());
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;

  try {
    if (token) {
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } finally {
    cookieStore.delete(sessionCookieName());
  }
}

export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      id: { not: currentSessionId },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return result.count;
}

export const getSession = cache(async (): Promise<SessionContext | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;

  if (!token) {
    return null;
  }

  const now = new Date();

  let session;

  try {
    session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        workspaceId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            deletedAt: true,
            memberships: {
              orderBy: { createdAt: "asc" },
              select: {
                role: true,
                workspace: {
                  select: { id: true, name: true, slug: true, deletedAt: true },
                },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    // Si la base de datos no tiene el esquema que espera el código, la
    // aplicación no puede ni leer la sesión. Se dice con claridad en vez de
    // dejar un «error de interfaz» sin explicación.
    if (esEsquemaDesactualizado(error)) {
      throw new ConfigurationError(
        "La base de datos está desactualizada: falta aplicar una migración. Ejecuta `pnpm db:migrate` en el servidor y vuelve a cargar la página.",
      );
    }

    throw error;
  }

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !session.user.isActive ||
    session.user.deletedAt
  ) {
    return null;
  }

  const workspaces: ActiveWorkspace[] = session.user.memberships
    .filter((membership) => !membership.workspace.deletedAt)
    .map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role,
    }));

  // El estudio activo es el que guardó la sesión. Si la persona ya no
  // pertenece a él, se recurre al primero que le quede.
  const membership =
    workspaces.find((workspace) => workspace.id === session.workspaceId) ?? workspaces[0];

  if (!membership) {
    return null;
  }

  if (now.getTime() - session.lastUsedAt.getTime() > 60 * 60 * 1_000) {
    await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastUsedAt: now },
    });
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    },
    workspace: {
      id: membership.id,
      name: membership.name,
      slug: membership.slug,
      role: membership.role,
    },
    workspaces,
  };
});

/**
 * Cambia el estudio con el que se trabaja.
 *
 * La pertenencia se comprueba: no se puede entrar en un estudio del que la
 * persona no forma parte.
 */
export async function switchWorkspace(
  session: SessionContext,
  workspaceId: string,
): Promise<boolean> {
  const pertenece = session.workspaces.some((workspace) => workspace.id === workspaceId);

  if (!pertenece) {
    return false;
  }

  await prisma.session.updateMany({
    where: { id: session.sessionId, revokedAt: null },
    data: { workspaceId },
  });

  return true;
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export function requireWorkspaceAdmin(session: SessionContext): void {
  if (
    session.user.role !== "SUPERADMIN" &&
    session.user.role !== "ADMIN" &&
    session.workspace.role !== "OWNER" &&
    session.workspace.role !== "ADMIN"
  ) {
    redirect("/dashboard");
  }
}

export function getConfiguredSessionTtlDays(): number {
  return getServerEnv().SESSION_TTL_DAYS;
}
