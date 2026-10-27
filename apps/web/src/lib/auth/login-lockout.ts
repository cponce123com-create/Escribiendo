import "server-only";
import { prisma } from "@/lib/db";

/** Devuelve true solo al iniciar un bloqueo, para auditarlo una única vez. */
export async function registerFailedLogin(userId: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    // Serializa los fallos de esta cuenta; otras cuentas no quedan bloqueadas.
    const [user] = await transaction.$queryRaw<{ lockedUntil: Date | null }[]>`
      SELECT "lockedUntil" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
    if (!user || (user.lockedUntil && user.lockedUntil > now)) return false;

    if (user.lockedUntil) {
      await transaction.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }
    const updated = await transaction.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (updated.failedLoginAttempts < 5) return false;

    // No se extiende un bloqueo activo; tras vencer se abre una ventana nueva.
    await transaction.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(now.getTime() + 15 * 60_000) },
    });
    return true;
  });
}

export function successfulLoginData(now: Date) {
  return { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now };
}
