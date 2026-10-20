"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";
import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { logger } from "@/lib/logger";
import { errorState, formValue, successState } from "@/lib/form-helpers";
import type { ActionState } from "@/lib/action-state";
import { assertCanPerform } from "@/lib/books/permissions";
import { emailSchema, passwordSchema, personNameSchema } from "@escribiendo/shared";

/**
 * Equipo del estudio: invitaciones, roles y bajas.
 *
 * Las invitaciones no se envían por correo: la aplicación no tiene
 * proveedor de correo. El token se genera aquí y **se muestra una sola vez**
 * para que quien administra lo comparta por el medio que prefiera.
 */

const roleSchema = z.enum(["OWNER", "ADMIN", "EDITOR", "AUTHOR", "REVIEWER"]);
const uuidSchema = z.string().uuid("El identificador no es válido.");

/** Días que dura una invitación. */
const INVITATION_TTL_DAYS = 14;

export interface TeamActionState extends ActionState {
  /** Token de la invitación recién creada. Solo se muestra una vez. */
  invitationToken?: string;
  /** Dirección de la invitación. */
  invitationEmail?: string;
  /** Enlace completo de aceptación. */
  invitationUrl?: string;
}

function logActionError(event: string, context: RequestContext | undefined, error: unknown): void {
  logger.error(event, {
    requestId: context?.requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function createInvitationAction(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "team:manage");
  } catch {
    return errorState("No tienes permisos para invitar a este estudio.");
  }

  const email = emailSchema.safeParse(formValue(formData, "email").trim().toLowerCase());
  const role = roleSchema.safeParse(formValue(formData, "role") || "AUTHOR");

  if (!email.success) {
    return errorState("El correo no es válido.");
  }

  if (!role.success) {
    return errorState("El rol no es válido.");
  }

  if (role.data === "OWNER") {
    return errorState("El propietario del estudio no se puede asignar por invitación.");
  }

  // Una persona que ya está en el estudio no necesita invitación.
  const yaEsMiembro = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: session.workspace.id,
      user: { email: email.data, deletedAt: null },
    },
    select: { id: true },
  });

  if (yaEsMiembro) {
    return errorState("Esa persona ya forma parte del estudio.");
  }

  const pendiente = await prisma.workspaceInvitation.findFirst({
    where: {
      workspaceId: session.workspace.id,
      email: email.data,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (pendiente) {
    return errorState("Ya hay una invitación vigente para ese correo.");
  }

  const token = generateToken(32);

  try {
    await prisma.workspaceInvitation.create({
      data: {
        workspaceId: session.workspace.id,
        email: email.data,
        role: role.data,
        tokenHash: hashToken(token),
        invitedById: session.user.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1_000),
      },
    });
  } catch (error) {
    logActionError("team.invitation_create_error", context, error);
    return errorState("No se ha podido crear la invitación.");
  }

  await writeAuditLog(
    {
      action: "TEAM_INVITATION_CREATED",
      entityType: "WorkspaceInvitation",
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { email: email.data, role: role.data },
    },
    context,
  );

  revalidatePath("/team");

  return {
    status: "success",
    message:
      "Invitación creada. El enlace solo se muestra ahora: cópialo y compártelo por el medio que prefieras.",
    invitationToken: token,
    invitationEmail: email.data,
    invitationUrl: `/invitacion/${token}`,
  };
}

export async function revokeInvitationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "team:manage");
  } catch {
    return errorState("No tienes permisos para gestionar el equipo.");
  }

  const invitationId = uuidSchema.safeParse(formValue(formData, "invitationId"));

  if (!invitationId.success) {
    return errorState("La invitación no es válida.");
  }

  const result = await prisma.workspaceInvitation.updateMany({
    where: {
      id: invitationId.data,
      workspaceId: session.workspace.id,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    return errorState("La invitación no existe o ya no se puede revocar.");
  }

  await writeAuditLog(
    {
      action: "TEAM_INVITATION_REVOKED",
      entityType: "WorkspaceInvitation",
      entityId: invitationId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/team");

  return successState("Invitación revocada.");
}

/** Cambia el rol de una persona del estudio. */
export async function changeMemberRoleAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "team:manage");
  } catch {
    return errorState("No tienes permisos para gestionar el equipo.");
  }

  const userId = uuidSchema.safeParse(formValue(formData, "userId"));
  const role = roleSchema.safeParse(formValue(formData, "role"));

  if (!userId.success || !role.success) {
    return errorState("Los datos no son válidos.");
  }

  if (role.data === "OWNER") {
    return errorState("El propietario del estudio no se puede asignar por esta vía.");
  }

  const owner = await prisma.workspace.findFirst({
    where: { id: session.workspace.id },
    select: { ownerId: true },
  });

  if (owner?.ownerId === userId.data) {
    return errorState("El rol del propietario del estudio no se puede cambiar.");
  }

  const result = await prisma.workspaceMember.updateMany({
    where: { workspaceId: session.workspace.id, userId: userId.data },
    data: { role: role.data },
  });

  if (result.count === 0) {
    return errorState("Esa persona no forma parte del estudio.");
  }

  await writeAuditLog(
    {
      action: "TEAM_MEMBER_ROLE_CHANGED",
      entityType: "WorkspaceMember",
      entityId: userId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      metadata: { role: role.data },
    },
    context,
  );

  revalidatePath("/team");

  return successState("Rol actualizado.");
}

/** Quita a una persona del estudio. */
export async function removeMemberAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    assertCanPerform(session.workspace.role, "team:manage");
  } catch {
    return errorState("No tienes permisos para gestionar el equipo.");
  }

  const userId = uuidSchema.safeParse(formValue(formData, "userId"));

  if (!userId.success) {
    return errorState("Los datos no son válidos.");
  }

  const owner = await prisma.workspace.findFirst({
    where: { id: session.workspace.id },
    select: { ownerId: true },
  });

  if (owner?.ownerId === userId.data) {
    return errorState("El propietario del estudio no se puede expulsar.");
  }

  if (userId.data === session.user.id) {
    return errorState("No puedes expulsarte a ti mismo del estudio.");
  }

  const result = await prisma.workspaceMember.deleteMany({
    where: { workspaceId: session.workspace.id, userId: userId.data },
  });

  if (result.count === 0) {
    return errorState("Esa persona no forma parte del estudio.");
  }

  await writeAuditLog(
    {
      action: "TEAM_MEMBER_REMOVED",
      entityType: "WorkspaceMember",
      entityId: userId.data,
      workspaceId: session.workspace.id,
      actorId: session.user.id,
    },
    context,
  );

  revalidatePath("/team");

  return successState("Persona retirada del estudio.");
}

/**
 * Acepta una invitación.
 *
 * Si quien acepta ya tiene cuenta, se le añade al estudio. Si no, se le crea
 * una con la política de contraseñas de la aplicación y se inicia sesión.
 */
export async function acceptInvitationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
  } catch {
    return errorState("No se ha podido validar la solicitud.");
  }

  const token = formValue(formData, "token");
  const tokenHash = hashToken(token);

  const invitation = await prisma.workspaceInvitation.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      workspaceId: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });

  if (!invitation) {
    return errorState("La invitación no es válida.");
  }

  if (invitation.acceptedAt) {
    return errorState("Esa invitación ya se ha usado.");
  }

  if (invitation.revokedAt) {
    return errorState("Esa invitación se ha revocado.");
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    return errorState("Esa invitación ha caducado. Pide una nueva.");
  }

  const session = await getSession();
  const nombre = formValue(formData, "name").trim();
  const password = formValue(formData, "password");

  // Con sesión: la persona ya tiene cuenta y solo hay que añadirla.
  if (session) {
    const correoSesion = session.user.email.toLowerCase();

    if (correoSesion !== invitation.email.toLowerCase()) {
      return errorState(
        "Esta invitación es para otro correo. Entra con la cuenta correspondiente o créala.",
      );
    }

    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: session.user.id,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
          role: invitation.role,
        },
        update: { role: invitation.role },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    await writeAuditLog(
      {
        action: "TEAM_INVITATION_ACCEPTED",
        entityType: "WorkspaceInvitation",
        entityId: invitation.id,
        workspaceId: invitation.workspaceId,
        actorId: session.user.id,
        metadata: { role: invitation.role },
      },
      context,
    );

    redirect("/team");
  }

  // Sin sesión: hay que crear la cuenta con la política de la aplicación.
  const parsedName = personNameSchema.safeParse(nombre);
  const parsedPassword = passwordSchema.safeParse(password);

  if (!parsedName.success) {
    return errorState("El nombre no es válido.");
  }

  if (!parsedPassword.success) {
    return errorState(
      parsedPassword.error.issues[0]?.message ?? "La contraseña no cumple la política.",
    );
  }

  const existente = await prisma.user.findFirst({
    where: { email: invitation.email.toLowerCase(), deletedAt: null },
    select: { id: true },
  });

  if (existente) {
    return errorState(
      "Ya existe una cuenta con ese correo. Entra con ella y acepta la invitación desde el equipo.",
    );
  }

  const passwordHash = await hashPassword(parsedPassword.data);

  const userId = await prisma.$transaction(async (transaction) => {
    const creado = await transaction.user.create({
      data: {
        email: invitation.email.toLowerCase(),
        name: parsedName.data,
        passwordHash,
        role: "AUTHOR",
      },
      select: { id: true },
    });

    await transaction.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: creado.id,
        role: invitation.role,
      },
    });

    await transaction.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return creado.id;
  });

  await createSession(userId, context);

  await writeAuditLog(
    {
      action: "TEAM_INVITATION_ACCEPTED",
      entityType: "WorkspaceInvitation",
      entityId: invitation.id,
      workspaceId: invitation.workspaceId,
      actorId: userId,
      metadata: { role: invitation.role, accountCreated: true },
    },
    context,
  );

  redirect("/team");
}
