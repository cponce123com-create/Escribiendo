import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), origin: vi.fn(), task: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/security/request-context", () => ({ assertRequestOrigin: mocks.origin }));
vi.mock("@/lib/db", () => ({ prisma: { characterAnalysisTask: { findFirst: mocks.task } } }));
import { POST } from "./route";
const request = () =>
  new Request("http://localhost/api/story-analysis/process", {
    method: "POST",
    body: JSON.stringify({ taskId: "11111111-1111-4111-8111-111111111111" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.origin.mockReturnValue(undefined);
});
it("rechaza una sesión ausente antes de consultar tareas", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.task).not.toHaveBeenCalled();
});
it.each(["READER", "REVIEWER"])("impide escrituras del procesador al rol %s", async (role) => {
  mocks.session.mockResolvedValue({ workspace: { id: "workspace", role } });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.task).not.toHaveBeenCalled();
});
it("busca tareas solo dentro del workspace y de un libro vigente", async () => {
  mocks.session.mockResolvedValue({ workspace: { id: "workspace", role: "AUTHOR" } });
  mocks.task.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(404);
  expect(mocks.task).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: "workspace",
        book: { workspaceId: "workspace", deletedAt: null },
      }),
    }),
  );
});
