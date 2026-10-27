import type { Prisma } from "../../packages/database/src/index";

export const SESSION_RETENTION_DAYS = 30;

export function sessionRetentionWhere(now: Date): Prisma.SessionWhereInput {
  const cutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * 86_400_000);
  return { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] };
}
