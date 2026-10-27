import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  session: vi.fn(),
  find: vi.fn(),
  limit: vi.fn(),
  claim: vi.fn(),
  create: vi.fn(),
  member: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  switch: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("REDIRECT");
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: m.session,
  createSession: vi.fn(),
  switchWorkspace: m.switch,
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: async () => "hash" }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: m.audit }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/security/request-context", () => ({
  assertServerActionOrigin: async () => ({ ip: "9.9.9.9" }),
}));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: m.limit }));
vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceInvitation: { findFirst: m.find },
    user: { findFirst: async () => null },
    $transaction: m.transaction,
  },
}));
import { acceptInvitationAction } from "./actions";
const form = () => {
  const f = new FormData();
  f.set("token", "x".repeat(64));
  f.set("name", "Ana Torres");
  f.set("password", "Bosque-Largo-2026!");
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  m.limit.mockReturnValue({ allowed: true });
  m.session.mockResolvedValue(null);
  m.find.mockResolvedValue({
    id: "i",
    workspaceId: "w",
    email: "ana@example.test",
    role: "AUTHOR",
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    revokedAt: null,
  });
  m.claim.mockResolvedValue({ count: 1 });
  m.create.mockResolvedValue({ id: "u" });
  m.transaction.mockImplementation((fn) =>
    fn({
      workspaceInvitation: { updateMany: m.claim },
      user: { create: m.create },
      workspaceMember: { create: m.member, upsert: m.member },
    }),
  );
});
it("limita por IP antes de consultar tokens", async () => {
  m.limit.mockReturnValue({ allowed: false });
  expect(await acceptInvitationAction({ status: "idle" }, form())).toMatchObject({
    status: "error",
    message: expect.stringContaining("Demasiados"),
  });
  expect(m.find).not.toHaveBeenCalled();
});
it("una invitación reclamada por otro intento no crea cuenta", async () => {
  m.claim.mockResolvedValue({ count: 0 });
  expect(await acceptInvitationAction({ status: "idle" }, form())).toMatchObject({
    status: "error",
    message: expect.stringContaining("ya no está disponible"),
  });
  expect(m.create).not.toHaveBeenCalled();
});
it("una colisión con correo eliminado devuelve un error legible", async () => {
  m.create.mockRejectedValue({ code: "P2002" });
  expect(await acceptInvitationAction({ status: "idle" }, form())).toMatchObject({
    status: "error",
    message: expect.stringContaining("correo"),
  });
});
it("con sesión también reclama el token antes de añadir al miembro", async () => {
  m.session.mockResolvedValue({ user: { id: "u", email: "ana@example.test" } });
  m.claim.mockResolvedValue({ count: 0 });
  expect(await acceptInvitationAction({ status: "idle" }, form())).toMatchObject({
    status: "error",
  });
  expect(m.member).not.toHaveBeenCalled();
  expect(m.switch).not.toHaveBeenCalled();
});
