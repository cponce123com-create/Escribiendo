"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  emailSchema,
  firstZodError,
  passwordSchema,
  personNameSchema,
  setupTokenSchema,
  zodFieldErrors,
} from "@escribiendo/shared";
import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { consumeRateLimit, loginRateLimitPolicy } from "@/lib/security/rate-limit";
import { assertServerActionOrigin, type RequestContext } from "@/lib/security/request-context";
import { writeAuditLog } from "./audit";
import type { AuthActionState } from "./action-state";
import { hashPassword, passwordNeedsRehash, verifyPassword, verifyWithDummyHash } from "./password";
import { hashToken, secureCompareTokens } from "./tokens";
import { createSession, destroyCurrentSession, getSession, revokeOtherSessions } from "./session";
import { passwordContainsIdentity, passwordsMatch, slugifyWorkspaceName } from "./identity";

const INVALID_CREDENTIALS =
  "El correo o la contraseña no son correctos. Si has fallado varias veces, espera antes de reintentar.";

const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Introduce tu contraseña.")
    .max(128, "La contraseña es demasiado larga."),
});

const setupSchema = z.object({
  setupToken: setupTokenSchema,
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Introduce tu contraseña actual.").max(128),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
});

const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(32, "El enlace de recuperación no es válido.")
    .max(200, "El enlace de recuperación no es válido."),
  password: passwordSchema,
  confirmPassword: z.string(),
});

const profileSchema = z.object({
  name: personNameSchema,
});

class SetupAlreadyCompletedError extends Error {
  constructor() {
    super("Setup already completed");
    this.name = "SetupAlreadyCompletedError";
  }
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorState(message: string, fieldErrors?: Record<string, string>): AuthActionState {
  return {
    status: "error",
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

function successState(message: string): AuthActionState {
  return { status: "success", message };
}

function logActionError(event: string, context: RequestContext | undefined, error: unknown): void {
  logger.error(event, {
    requestId: context?.requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

async function registerFailedLogin(userId: string, previousAttempts: number): Promise<void> {
  const attempts = previousAttempts + 1;
  const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1_000) : undefined;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: { increment: 1 },
      ...(lockedUntil ? { lockedUntil } : {}),
    },
  });
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
    const loginPolicy = loginRateLimitPolicy();
    const rateLimit = consumeRateLimit({
      scope: "login",
      identifier: context.ip ?? "unknown",
      limit: loginPolicy.limit,
      windowMs: loginPolicy.windowMs,
    });

    if (!rateLimit.allowed) {
      logger.warn("auth.login_rate_limited", { requestId: context.requestId });
      return errorState(
        "Demasiados intentos desde esta conexión. Espera unos minutos antes de volver a probar.",
      );
    }

    const parsed = loginSchema.safeParse({
      email: formValue(formData, "email"),
      password: formValue(formData, "password"),
    });

    if (!parsed.success) {
      return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isActive: true,
        deletedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      await verifyWithDummyHash(parsed.data.password);
      logger.warn("auth.login_failed", { requestId: context.requestId });
      return errorState(INVALID_CREDENTIALS);
    }

    const passwordIsValid = await verifyPassword(user.passwordHash, parsed.data.password);
    const now = new Date();
    const isLocked = Boolean(user.lockedUntil && user.lockedUntil > now);

    if (!passwordIsValid || isLocked) {
      if (!isLocked) {
        await registerFailedLogin(user.id, user.failedLoginAttempts);
      }

      if (user.failedLoginAttempts + 1 >= 5 && !isLocked) {
        await writeAuditLog(
          {
            action: "AUTH_ACCOUNT_LOCKED",
            entityType: "User",
            entityId: user.id,
            actorId: user.id,
          },
          context,
        );
      }

      logger.warn("auth.login_failed", {
        requestId: context.requestId,
        userId: user.id,
        locked: isLocked,
      });
      return errorState(INVALID_CREDENTIALS);
    }

    const nextPasswordHash = (await passwordNeedsRehash(user.passwordHash))
      ? await hashPassword(parsed.data.password)
      : undefined;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
      },
    });

    await createSession(user.id, context);
    await writeAuditLog(
      {
        action: "AUTH_LOGIN_SUCCEEDED",
        entityType: "User",
        entityId: user.id,
        actorId: user.id,
      },
      context,
    );
  } catch (error) {
    logActionError("auth.login_error", context, error);
    return errorState("No se ha podido iniciar sesión en este momento. Inténtalo de nuevo.");
  }

  redirect("/dashboard");
}

export async function setupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
    const env = getServerEnv();

    if (!env.SETUP_TOKEN) {
      return errorState(
        "La instalación no está habilitada. Configura SETUP_TOKEN en el servidor para crear la primera cuenta.",
      );
    }

    const rateLimit = consumeRateLimit({
      scope: "setup",
      identifier: context.ip ?? "unknown",
      limit: 5,
      windowMs: 60 * 60 * 1_000,
    });

    if (!rateLimit.allowed) {
      logger.warn("auth.setup_rate_limited", { requestId: context.requestId });
      return errorState("Demasiados intentos de instalación. Espera antes de volver a probar.");
    }

    if (await prisma.user.count({ where: { deletedAt: null } })) {
      return errorState("La instalación ya está completada.");
    }

    const parsed = setupSchema.safeParse({
      setupToken: formValue(formData, "setupToken"),
      name: formValue(formData, "name"),
      email: formValue(formData, "email"),
      password: formValue(formData, "password"),
      confirmPassword: formValue(formData, "confirmPassword"),
    });

    if (!parsed.success) {
      return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
    }

    if (!secureCompareTokens(parsed.data.setupToken, env.SETUP_TOKEN)) {
      logger.warn("auth.setup_token_rejected", { requestId: context.requestId });
      return errorState("El token de instalación no es válido.");
    }

    if (!passwordsMatch(parsed.data.password, parsed.data.confirmPassword)) {
      return errorState("Las contraseñas no coinciden.", {
        confirmPassword: "Las contraseñas no coinciden.",
      });
    }

    if (passwordContainsIdentity(parsed.data.password, parsed.data.email, parsed.data.name)) {
      return errorState("La contraseña no debe contener tu nombre ni tu correo electrónico.", {
        password: "La contraseña no debe contener tu nombre ni tu correo electrónico.",
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const workspaceBase = slugifyWorkspaceName(parsed.data.name);

    const created = await prisma.$transaction(
      async (transaction) => {
        const existingUsers = await transaction.user.count({ where: { deletedAt: null } });

        if (existingUsers > 0) {
          throw new SetupAlreadyCompletedError();
        }

        const user = await transaction.user.create({
          data: {
            email: parsed.data.email,
            name: parsed.data.name,
            passwordHash,
            role: "SUPERADMIN",
          },
        });

        const workspace = await transaction.workspace.create({
          data: {
            name: `Estudio de ${parsed.data.name}`.slice(0, 160),
            slug: `${workspaceBase}-${randomUUID().slice(0, 8)}`,
            ownerId: user.id,
          },
        });

        await transaction.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: "OWNER",
          },
        });

        return { user, workspace };
      },
      {
        isolationLevel: "Serializable",
        timeout: 15_000,
      },
    );

    await writeAuditLog(
      {
        action: "AUTH_SETUP_COMPLETED",
        entityType: "Workspace",
        entityId: created.workspace.id,
        workspaceId: created.workspace.id,
        actorId: created.user.id,
      },
      context,
    );

    await createSession(created.user.id, context);
  } catch (error) {
    if (error instanceof SetupAlreadyCompletedError) {
      return errorState("La instalación ya está completada.");
    }

    logActionError("auth.setup_error", context, error);
    return errorState(
      "No se ha podido completar la instalación. Revisa la conexión con la base de datos.",
    );
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  try {
    const context = await assertServerActionOrigin();
    const session = await getSession();

    await destroyCurrentSession();

    if (session) {
      await writeAuditLog(
        {
          action: "AUTH_LOGOUT",
          entityType: "Session",
          entityId: session.sessionId,
          workspaceId: session.workspace.id,
          actorId: session.user.id,
        },
        context,
      );
    }
  } catch (error) {
    logger.error("auth.logout_error", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  redirect("/login");
}

export async function changePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
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
    const rateLimit = consumeRateLimit({
      scope: "change-password",
      identifier: session.user.id,
      limit: 10,
      windowMs: 60 * 60 * 1_000,
    });

    if (!rateLimit.allowed) {
      return errorState("Demasiados intentos. Espera antes de volver a probar.");
    }

    const parsed = changePasswordSchema.safeParse({
      currentPassword: formValue(formData, "currentPassword"),
      newPassword: formValue(formData, "newPassword"),
      confirmPassword: formValue(formData, "confirmPassword"),
    });

    if (!parsed.success) {
      return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
    }

    if (!passwordsMatch(parsed.data.newPassword, parsed.data.confirmPassword)) {
      return errorState("Las contraseñas nuevas no coinciden.", {
        confirmPassword: "Las contraseñas nuevas no coinciden.",
      });
    }

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return errorState("La contraseña nueva debe ser distinta de la actual.", {
        newPassword: "La contraseña nueva debe ser distinta de la actual.",
      });
    }

    if (passwordContainsIdentity(parsed.data.newPassword, session.user.email, session.user.name)) {
      return errorState("La contraseña no debe contener tu nombre ni tu correo electrónico.", {
        newPassword: "La contraseña no debe contener tu nombre ni tu correo electrónico.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
      await writeAuditLog(
        {
          action: "AUTH_PASSWORD_CHANGE_FAILED",
          entityType: "User",
          entityId: session.user.id,
          workspaceId: session.workspace.id,
          actorId: session.user.id,
        },
        context,
      );
      return errorState("La contraseña actual no es correcta.", {
        currentPassword: "La contraseña actual no es correcta.",
      });
    }

    const nextPasswordHash = await hashPassword(parsed.data.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          passwordHash: nextPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.session.updateMany({
        where: {
          userId: session.user.id,
          id: { not: session.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    await writeAuditLog(
      {
        action: "AUTH_PASSWORD_CHANGED",
        entityType: "User",
        entityId: session.user.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
      },
      context,
    );

    revalidatePath("/account");
    return successState("Contraseña actualizada. Las demás sesiones se han cerrado.");
  } catch (error) {
    logActionError("auth.change_password_error", context, error);
    return errorState("No se ha podido cambiar la contraseña. Inténtalo de nuevo.");
  }
}

export async function updateProfileAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
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
    const parsed = profileSchema.safeParse({
      name: formValue(formData, "name"),
    });

    if (!parsed.success) {
      return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name },
    });

    await writeAuditLog(
      {
        action: "ACCOUNT_PROFILE_UPDATED",
        entityType: "User",
        entityId: session.user.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
      },
      context,
    );

    revalidatePath("/", "layout");
    return successState("Datos de la cuenta actualizados.");
  } catch (error) {
    logActionError("account.update_profile_error", context, error);
    return errorState("No se han podido actualizar los datos. Inténtalo de nuevo.");
  }
}

export async function revokeOtherSessionsAction(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
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
    const count = await revokeOtherSessions(session.user.id, session.sessionId);

    await writeAuditLog(
      {
        action: "AUTH_OTHER_SESSIONS_REVOKED",
        entityType: "User",
        entityId: session.user.id,
        workspaceId: session.workspace.id,
        actorId: session.user.id,
        metadata: { revokedSessions: count },
      },
      context,
    );

    revalidatePath("/account");
    return successState(
      count > 0
        ? `Se han cerrado ${count} ${count === 1 ? "sesión" : "sesiones"}.`
        : "No había otras sesiones activas.",
    );
  } catch (error) {
    logActionError("auth.revoke_sessions_error", context, error);
    return errorState("No se han podido cerrar las otras sesiones. Inténtalo de nuevo.");
  }
}

export async function resetPasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let context: RequestContext | undefined;

  try {
    context = await assertServerActionOrigin();
    const rateLimit = consumeRateLimit({
      scope: "reset-password",
      identifier: context.ip ?? "unknown",
      limit: 10,
      windowMs: 60 * 60 * 1_000,
    });

    if (!rateLimit.allowed) {
      return errorState("Demasiados intentos. Espera antes de volver a probar.");
    }

    const parsed = resetPasswordSchema.safeParse({
      token: formValue(formData, "token"),
      password: formValue(formData, "password"),
      confirmPassword: formValue(formData, "confirmPassword"),
    });

    if (!parsed.success) {
      return errorState(firstZodError(parsed.error), zodFieldErrors(parsed.error));
    }

    if (!passwordsMatch(parsed.data.password, parsed.data.confirmPassword)) {
      return errorState("Las contraseñas no coinciden.", {
        confirmPassword: "Las contraseñas no coinciden.",
      });
    }

    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { id: true, email: true, name: true, isActive: true, deletedAt: true } },
      },
    });

    if (
      !tokenRecord ||
      tokenRecord.usedAt ||
      tokenRecord.expiresAt <= new Date() ||
      !tokenRecord.user.isActive ||
      tokenRecord.user.deletedAt
    ) {
      logger.warn("auth.reset_token_rejected", { requestId: context.requestId });
      return errorState("El enlace de recuperación no es válido o ha caducado.");
    }

    if (
      passwordContainsIdentity(parsed.data.password, tokenRecord.user.email, tokenRecord.user.name)
    ) {
      return errorState("La contraseña no debe contener tu nombre ni tu correo electrónico.", {
        password: "La contraseña no debe contener tu nombre ni tu correo electrónico.",
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new Error("Reset token already consumed");
      }

      await transaction.user.update({
        where: { id: tokenRecord.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await transaction.passwordResetToken.updateMany({
        where: { userId: tokenRecord.userId, usedAt: null },
        data: { usedAt: now },
      });

      await transaction.session.updateMany({
        where: { userId: tokenRecord.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    await writeAuditLog(
      {
        action: "AUTH_PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: tokenRecord.userId,
        actorId: tokenRecord.userId,
      },
      context,
    );
  } catch (error) {
    logActionError("auth.reset_password_error", context, error);
    return errorState("No se ha podido restablecer la contraseña. Solicita un enlace nuevo.");
  }

  redirect("/login?reset=1");
}
