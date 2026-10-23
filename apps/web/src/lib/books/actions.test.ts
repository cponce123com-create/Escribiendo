import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

const mockPrisma = {
  book: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn(),
  },
  bookSection: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  },
  sectionRevision: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  characterAnalysisTask: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
  $executeRawUnsafe: vi.fn(),
};

const mockSession = {
  sessionId: "session-1",
  user: { id: "user-1", email: "test@example.com", name: "Test User", role: "AUTHOR" },
  workspace: { id: "workspace-1", name: "Test Workspace", slug: "test", role: "OWNER" },
  workspaces: [{ id: "workspace-1", name: "Test Workspace", slug: "test", role: "OWNER" }],
};

const mockContext = {
  requestId: "req-1",
  ip: "127.0.0.1",
  ipHash: "hash",
  userAgent: "test-agent",
};

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue(mockSession),
}));

vi.mock("@/lib/security/request-context", () => ({
  assertServerActionOrigin: vi.fn().mockResolvedValue(mockContext),
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { createBookAction } from "./actions";
import type { LibraryActionState } from "./action-state";

describe("books actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  function makeFormData(data: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(data)) {
      fd.append(key, value);
    }
    return fd;
  }

  describe("createBookAction", () => {
    it("crea un libro y redirige", async () => {
      const bookId = "book-1";
      mockPrisma.book.create.mockResolvedValue({ id: bookId });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const formData = makeFormData({
        title: "Mi Libro",
        authorName: "Autor Test",
        language: "es",
      });

      const result = await createBookAction({ status: "idle" }, formData);

      expect(mockPrisma.book.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Mi Libro",
            authorName: "Autor Test",
            language: "es",
            workspaceId: "workspace-1",
            createdById: "user-1",
          }),
        })
      );
      expect(result).toEqual({ status: "success", message: expect.any(String) });
    });

    it("rechaza si el usuario no tiene permisos", async () => {
      const { getSession } = await import("@/lib/auth/session");
      (getSession as any).mockResolvedValueOnce({
        ...mockSession,
        workspace: { ...mockSession.workspace, role: "REVIEWER" },
      });

      const formData = makeFormData({
        title: "Mi Libro",
        authorName: "Autor Test",
        language: "es",
      });

      const result = await createBookAction({ status: "idle" }, formData);

      expect(result.status).toBe("error");
      expect(result.message).toContain("permisos");
    });

    it("valida campos requeridos", async () => {
      const formData = makeFormData({
        title: "",
        authorName: "",
        language: "es",
      });

      const result = await createBookAction({ status: "idle" }, formData);

      expect(result.status).toBe("error");
      expect(result.fieldErrors).toBeDefined();
    });
  });
});

describe("actions - smoke imports", () => {
  it("importa sin errores", () => {
    expect(true).toBe(true);
  });
});