import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: { bookEdition: { findFirst: vi.fn(), updateMany: vi.fn() } },
  session: { user: { id: "u" }, workspace: { id: "w", role: "OWNER" } },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => mocks.session }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/security/request-context", () => ({ assertServerActionOrigin: vi.fn() }));
vi.mock("@/lib/layout/profiles", () => ({ ensureTemplateProfile: vi.fn(), getTemplate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { updateEditionTocAction } from "./actions";
const bookId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.workspace.role = "OWNER";
  mocks.db.bookEdition.findFirst.mockResolvedValue({ id: "edition" });
  mocks.db.bookEdition.updateMany.mockResolvedValue({ count: 1 });
});
it("valida profundidad y persiste los grupos con alcance de espacio de trabajo", async () => {
  const data = new FormData();
  data.set("bookId", bookId);
  data.set("tocDepth", "chapters-h1-h2");
  data.set("tocIncludeFrontMatter", "on");
  expect((await updateEditionTocAction({ status: "idle" }, data)).status).toBe("success");
  expect(mocks.db.bookEdition.updateMany).toHaveBeenCalledWith({
    where: { id: "edition", bookId, book: { workspaceId: "w", deletedAt: null } },
    data: { tocDepth: "chapters-h1-h2", tocIncludeFrontMatter: true, tocIncludeBackMatter: false },
  });
});
it("rechaza profundidad desconocida y permisos insuficientes", async () => {
  const data = new FormData();
  data.set("bookId", bookId);
  data.set("tocDepth", "infinito");
  expect((await updateEditionTocAction({ status: "idle" }, data)).status).toBe("error");
  mocks.session.workspace.role = "REVIEWER";
  data.set("tocDepth", "chapters-h1");
  expect((await updateEditionTocAction({ status: "idle" }, data)).status).toBe("error");
  expect(mocks.db.bookEdition.updateMany).not.toHaveBeenCalled();
});
