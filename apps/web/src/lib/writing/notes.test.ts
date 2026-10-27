import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

const { mockPrisma, mockSession } = vi.hoisted(() => {
  const mockPrisma = {
    writingNote: { findMany: vi.fn() },
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

import { listBookNotes } from "./notes";

function whereOfFirstCall(): Record<string, unknown> {
  return mockPrisma.writingNote.findMany.mock.calls[0]?.[0].where as Record<string, unknown>;
}

describe("listBookNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.writingNote.findMany.mockResolvedValue([]);
  });

  it("filtra por la sección y conserva las notas generales del libro", async () => {
    await listBookNotes(mockSession, "book-1", "section-1");

    expect(whereOfFirstCall()).toMatchObject({
      bookId: "book-1",
      userId: "user-1",
      OR: [{ sectionId: "section-1" }, { sectionId: null }],
    });
  });

  it("trae todas las notas del libro cuando no se pide una sección", async () => {
    await listBookNotes(mockSession, "book-1");

    expect(whereOfFirstCall()).not.toHaveProperty("OR");
  });

  it("mantiene el aislamiento por espacio de trabajo y por autora", async () => {
    await listBookNotes(mockSession, "book-1", "section-1");

    expect(whereOfFirstCall()).toMatchObject({
      userId: "user-1",
      book: { workspaceId: "workspace-1", deletedAt: null },
    });
  });
});
