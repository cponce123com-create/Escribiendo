import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  origin: vi.fn(),
  task: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/security/request-context", () => ({ assertRequestOrigin: mocks.origin }));
vi.mock("@/lib/db", () => ({
  prisma: { characterAnalysisTask: { findFirst: mocks.task, updateMany: mocks.claim } },
}));
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

it.each(["PROCESSING", "FAILED"])(
  "no procesa una tarea sin reclamación atómica (%s)",
  async (status) => {
    mocks.session.mockResolvedValue({ workspace: { id: "workspace", role: "AUTHOR" } });
    mocks.task.mockResolvedValue({ id: "t", status, attempts: 2 });
    mocks.claim.mockResolvedValue({ count: 0 });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attempts: 2,
          AND: expect.objectContaining({ attempts: { lt: 5 } }),
        }),
      }),
    );
  },
);
it("marca como definitivo el fallo con intentos agotados", async () => {
  mocks.session.mockResolvedValue({ workspace: { id: "workspace", role: "AUTHOR" } });
  mocks.task.mockResolvedValue({ id: "t", status: "FAILED", attempts: 5 });
  mocks.claim.mockResolvedValue({ count: 1 });
  const response = await POST(request());
  expect(await response.json()).toMatchObject({ status: "FAILED", retryable: false });
});
