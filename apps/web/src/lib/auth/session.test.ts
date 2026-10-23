import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockPrisma, mockCookies } = vi.hoisted(() => {
  const mockPrisma = {
    session: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  const mockCookies = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  return { mockPrisma, mockCookies };
});

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@escribiendo/database", () => ({
  esEsquemaDesactualizado: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookies),
}));

vi.mock("@/lib/security/request-context", () => ({
  getRequestContext: vi.fn().mockResolvedValue({
    requestId: "req-1",
    ip: "127.0.0.1",
    ipHash: "hash",
    userAgent: "test-agent",
  }),
}));

vi.mock("@/lib/env", () => ({
  isProduction: vi.fn().mockReturnValue(false),
  getSessionTtlMs: vi.fn().mockReturnValue(30 * 24 * 60 * 60 * 1000),
  getServerEnv: vi.fn().mockReturnValue({ SESSION_TTL_DAYS: 30 }),
}));

vi.mock("@/lib/auth/tokens", () => ({
  generateToken: vi.fn().mockReturnValue("test-token"),
  hashToken: vi.fn((t) => `hash-${t}`),
}));

vi.mock("@/lib/errors", () => ({
  isAppError: vi.fn((e) => e?.name === "ConfigurationError"),
  ConfigurationError: class extends Error { constructor(m: string) { super(m); this.name = "ConfigurationError"; } },
}));

import { createSession, destroyCurrentSession, revokeOtherSessions, getSession, switchWorkspace, requireSession, requireWorkspaceAdmin } from "./session";
import type { SessionContext } from "./session";

describe("auth session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    role: "AUTHOR" as const,
    isActive: true,
    deletedAt: null,
    memberships: [
      {
        role: "OWNER" as const,
        workspace: { id: "ws-1", name: "WS1", slug: "ws1", deletedAt: null },
      },
    ],
  };

  const mockSessionRecord = {
    id: "session-1",
    tokenHash: "hash-test-token",
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    lastUsedAt: new Date(),
    workspaceId: "ws-1",
    user: mockUser,
  };

  describe("createSession", () => {
    it("crea sesión y establece cookie", async () => {
      mockPrisma.session.create.mockResolvedValue({});

      await createSession("user-1");

      expect(mockPrisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            tokenHash: "hash-test-token",
          }),
        })
      );
      expect(mockCookies.set).toHaveBeenCalledWith(
        "escribiendo_session",
        "test-token",
        expect.objectContaining({ httpOnly: true, path: "/" })
      );
    });

    it("usa workspaceId si se proporciona", async () => {
      mockPrisma.session.create.mockResolvedValue({});

      await createSession("user-1", undefined, "ws-2");

      expect(mockPrisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: "ws-2" }),
        })
      );
    });
  });

  describe("destroyCurrentSession", () => {
    it("revoca sesión y borra cookie", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

      await destroyCurrentSession();

      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: "hash-test-token", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockCookies.delete).toHaveBeenCalledWith("escribiendo_session");
    });

    it("borra cookie aunque no haya token", async () => {
      mockCookies.get.mockReturnValue(undefined);

      await destroyCurrentSession();

      expect(mockCookies.delete).toHaveBeenCalledWith("escribiendo_session");
    });
  });

  describe("revokeOtherSessions", () => {
    it("revoca otras sesiones del usuario", async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

      const count = await revokeOtherSessions("user-1", "session-1");

      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", id: { not: "session-1" }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(count).toBe(3);
    });
  });

  describe("getSession", () => {
    it("retorna null si no hay cookie", async () => {
      mockCookies.get.mockReturnValue(undefined);

      const session = await getSession();

      expect(session).toBeNull();
    });

    it("retorna null si sesión expirada o revocada", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSessionRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      const session = await getSession();

      expect(session).toBeNull();
    });

    it("retorna null si usuario inactivo o borrado", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSessionRecord,
        user: { ...mockUser, isActive: false },
      });

      const session = await getSession();

      expect(session).toBeNull();
    });

    it("retorna SessionContext válido", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      mockPrisma.session.findUnique.mockResolvedValue(mockSessionRecord);

      const session = await getSession();

      expect(session).toMatchObject({
        sessionId: "session-1",
        user: { id: "user-1", email: "test@example.com", name: "Test User", role: "AUTHOR" },
        workspace: { id: "ws-1", name: "WS1", slug: "ws1", role: "OWNER" },
      });
    });

    it("usa el primer workspace si workspaceId de sesión no coincide", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSessionRecord,
        workspaceId: "ws-999",
      });

      const session = await getSession();

      expect(session?.workspace.id).toBe("ws-1");
    });

    it("actualiza lastUsedAt si pasó más de 1 hora", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      mockPrisma.session.findUnique.mockResolvedValue({
        ...mockSessionRecord,
        lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });

      await getSession();

      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", revokedAt: null },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("lanza ConfigurationError si falta esquema BD", async () => {
      mockCookies.get.mockReturnValue({ value: "test-token" });
      const { esEsquemaDesactualizado } = await import("@escribiendo/database");
      (esEsquemaDesactualizado as any).mockReturnValue(true);
      mockPrisma.session.findUnique.mockRejectedValue(new Error("P2021"));

      await expect(getSession()).rejects.toMatchObject({ name: "ConfigurationError" });
    });
  });

  describe("switchWorkspace", () => {
    it("cambia workspace si usuario pertenece a él", async () => {
      const session: SessionContext = {
        sessionId: "session-1",
        user: mockUser,
        workspace: { id: "ws-1", name: "WS1", slug: "ws1", role: "OWNER" },
        workspaces: [
          { id: "ws-1", name: "WS1", slug: "ws1", role: "OWNER" },
          { id: "ws-2", name: "WS2", slug: "ws2", role: "EDITOR" },
        ],
      };
      mockPrisma.session.updateMany.mockResolvedValue({});

      const result = await switchWorkspace(session, "ws-2");

      expect(result).toBe(true);
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", revokedAt: null },
        data: { workspaceId: "ws-2" },
      });
    });

    it("retorna false si usuario no pertenece al workspace", async () => {
      const session: SessionContext = {
        sessionId: "session-1",
        user: mockUser,
        workspace: { id: "ws-1", name: "WS1", slug: "ws1", role: "OWNER" },
        workspaces: [{ id: "ws-1", name: "WS1", slug: "ws1", role: "OWNER" }],
      };

      const result = await switchWorkspace(session, "ws-999");

      expect(result).toBe(false);
    });
  });

  describe("requireSession", () => {
    it("lanza redirect si no hay sesión", async () => {
      const { redirect } = await import("next/navigation");
      (redirect as any).mockImplementation(() => { throw new Error("REDIRECT"); });

      mockCookies.get.mockReturnValue(undefined);

      await expect(requireSession()).rejects.toThrow("REDIRECT");
    });
  });

  describe("requireWorkspaceAdmin", () => {
    it("permite OWNER workspace", () => {
      const session: SessionContext = {
        sessionId: "s1",
        user: { id: "u1", email: "e@e.com", name: "U", role: "AUTHOR" },
        workspace: { id: "ws1", name: "WS", slug: "ws", role: "OWNER" },
        workspaces: [],
      };
      expect(() => requireWorkspaceAdmin(session)).not.toThrow();
    });

    it("permite ADMIN workspace", () => {
      const session: SessionContext = {
        sessionId: "s1",
        user: { id: "u1", email: "e@e.com", name: "U", role: "AUTHOR" },
        workspace: { id: "ws1", name: "WS", slug: "ws", role: "ADMIN" },
        workspaces: [],
      };
      expect(() => requireWorkspaceAdmin(session)).not.toThrow();
    });

    it("permite SUPERADMIN global", () => {
      const session: SessionContext = {
        sessionId: "s1",
        user: { id: "u1", email: "e@e.com", name: "U", role: "SUPERADMIN" },
        workspace: { id: "ws1", name: "WS", slug: "ws", role: "AUTHOR" },
        workspaces: [],
      };
      expect(() => requireWorkspaceAdmin(session)).not.toThrow();
    });

    it("redirige si no es admin", async () => {
      const { redirect } = await import("next/navigation");
      (redirect as any).mockImplementation(() => { throw new Error("REDIRECT"); });

      const session: SessionContext = {
        sessionId: "s1",
        user: { id: "u1", email: "e@e.com", name: "U", role: "AUTHOR" },
        workspace: { id: "ws1", name: "WS", slug: "ws", role: "AUTHOR" },
        workspaces: [],
      };
      expect(() => requireWorkspaceAdmin(session)).toThrow("REDIRECT");
    });
  });
});