import "server-only";
import { createHash } from "node:crypto";
import type { SessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
export type ReviewStatus = "open" | "ignored" | "intentional" | "resolved";
export function reviewKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
export function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "open" || value === "ignored" || value === "intentional" || value === "resolved";
}
export async function loadLaboratoryReview(session: SessionContext, bookId: string) {
  return prisma.laboratoryReviewState.findFirst({
    where: {
      bookId,
      userId: session.user.id,
      workspaceId: session.workspace.id,
      book: { workspaceId: session.workspace.id, deletedAt: null },
    },
    select: { decisions: true, disabledRules: true, version: true },
  });
}
export function reviewStatusFor(decisions: unknown, key: string): ReviewStatus {
  if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) return "open";
  const value = (decisions as Record<string, unknown>)[reviewKey(key)];
  return isReviewStatus(value) ? value : "open";
}
