import { expect, it } from "vitest";
import { analysisTaskClaimWhere, MAX_ANALYSIS_ATTEMPTS } from "./analysis-task-policy";
const now = new Date("2026-01-01T12:00:00Z");
it("solo reclama PROCESSING vencidas y nunca más de cinco intentos", () => {
  const where = analysisTaskClaimWhere("t", "w", now);
  expect(MAX_ANALYSIS_ATTEMPTS).toBe(5);
  expect(where).toEqual({
    id: "t",
    workspaceId: "w",
    attempts: { lt: 5 },
    OR: [
      { status: { in: ["PENDING", "FAILED"] } },
      { status: "PROCESSING", updatedAt: { lt: new Date("2026-01-01T11:50:00Z") } },
    ],
  });
});
