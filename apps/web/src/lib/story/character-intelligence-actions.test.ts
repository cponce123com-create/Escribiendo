import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const update = vi.hoisted(() => vi.fn(async () => ({ count: 0 })));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ workspace: { id: "w" } }) }));
vi.mock("./action-helpers", () => ({ storyBookExists: async () => true }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    characterAnalysisTask: {
      updateMany: update,
      groupBy: async () => [],
      findMany: async () => [],
    },
    storyCharacterSuggestion: { findMany: async () => [] },
  },
}));
import { getCharacterSuggestions } from "./character-intelligence-actions";
it("la recuperación de la cola cierra tareas vencidas con cinco intentos", async () => {
  expect((await getCharacterSuggestions("b")).ok).toBe(true);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: "w",
        bookId: "b",
        status: "PROCESSING",
        attempts: { gte: 5 },
        updatedAt: { lt: expect.any(Date) },
      }),
      data: { status: "FAILED" },
    }),
  );
});
