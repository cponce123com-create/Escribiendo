import type { Prisma } from "@escribiendo/database";

export const MAX_ANALYSIS_ATTEMPTS = 5;
export const ANALYSIS_LEASE_MS = 10 * 60_000;

export function analysisTaskClaimWhere(
  id: string,
  workspaceId: string,
  now: Date,
): Prisma.CharacterAnalysisTaskWhereInput {
  return {
    id,
    workspaceId,
    attempts: { lt: MAX_ANALYSIS_ATTEMPTS },
    OR: [
      { status: { in: ["PENDING", "FAILED"] } },
      { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - ANALYSIS_LEASE_MS) } },
    ],
  };
}
