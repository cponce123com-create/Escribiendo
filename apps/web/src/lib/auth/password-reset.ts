import "server-only";
import { prisma } from "@/lib/db";
import { hashToken } from "./tokens";

export interface ResetTokenInfo {
  valid: boolean;
  userName?: string;
}

export function isResetTokenWellFormed(token: string): boolean {
  return token.length >= 32 && token.length <= 200 && /^[A-Za-z0-9_-]+$/u.test(token);
}

export async function inspectPasswordResetToken(token: string): Promise<ResetTokenInfo> {
  if (!isResetTokenWellFormed(token)) {
    return { valid: false };
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      usedAt: true,
      user: { select: { name: true, isActive: true, deletedAt: true } },
    },
  });

  if (
    !record ||
    record.usedAt ||
    record.expiresAt <= new Date() ||
    !record.user.isActive ||
    record.user.deletedAt
  ) {
    return { valid: false };
  }

  return { valid: true, userName: record.user.name };
}
