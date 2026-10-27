import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

const { mockPrisma, mockSession } = vi.hoisted(() => {
  const mockPrisma = {
    workspaceMember: { findMany: vi.fn() },
  };

  const mockSession = {
    sessionId: "session-1",
    user: {
      id: "user-1",
      email: "autora@example.com",
      name: "Autora",
      role: "AUTHOR" as const,
    },
    workspace: {
      id: "workspace-1",
      name: "Estudio",
      slug: "estudio",
      role: "OWNER" as const,
    },
    workspaces: [{ id: "workspace-1", name: "Estudio", slug: "estudio", role: "OWNER" as const }],
  } satisfies SessionContext;

  return { mockPrisma, mockSession };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import { listAssignableMembers } from "./members";

describe("listAssignableMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("se limita al espacio de trabajo y pide solo nombre e identificador", async () => {
    mockPrisma.workspaceMember.findMany.mockResolvedValue([
      { user: { id: "user-2", name: "Coautora" } },
    ]);

    await expect(listAssignableMembers(mockSession)).resolves.toEqual([
      { userId: "user-2", name: "Coautora" },
    ]);

    expect(mockPrisma.workspaceMember.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      select: { user: { select: { id: true, name: true } } },
    });
  });

  it("no consulta la ficha completa ni el propietario del espacio", async () => {
    mockPrisma.workspaceMember.findMany.mockResolvedValue([]);

    await listAssignableMembers(mockSession);

    const args = mockPrisma.workspaceMember.findMany.mock.calls[0]?.[0];

    expect(JSON.stringify(args)).not.toContain("_count");
    expect(mockPrisma).not.toHaveProperty("workspace");
  });
});
