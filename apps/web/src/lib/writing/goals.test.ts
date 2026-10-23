import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    writingGoal: { findMany: vi.fn() },
    bookSection: { findMany: vi.fn() },
    sectionRevision: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { listGoals } from "./goals";

const session = {
  sessionId: "session-1",
  user: { id: "user-1", email: "user@example.com", name: "User", role: "AUTHOR" },
  workspace: { id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" },
  workspaces: [{ id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" }],
} as unknown as SessionContext;

const periodStart = new Date("2026-10-01T00:00:00+02:00");
const periodEnd = new Date("2026-10-31T23:59:59+01:00");
const revisionDate = new Date("2026-10-15T12:00:00+02:00");

describe("objetivos de escritura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.writingGoal.findMany.mockResolvedValue([
      {
        id: "goal-a",
        bookId: "book-a",
        periodStart,
        periodEnd,
        targetWords: 100,
        book: { title: "Libro A" },
      },
      {
        id: "goal-general",
        bookId: null,
        periodStart,
        periodEnd,
        targetWords: 100,
        book: null,
      },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.bookSection.findMany.mockImplementation(
      async (args: { where: { book?: { id?: string } } }) => {
        if (args.where.book?.id === "book-a") {
          return [{ id: "s-a" }];
        }

        return [{ id: "s-a" }, { id: "s-b" }];
      },
    );
    mockPrisma.sectionRevision.findMany.mockImplementation(
      async (args: { where: { sectionId: { in: string[] } } }) =>
        args.where.sectionId.in.map((sectionId) => ({
          sectionId,
          version: 1,
          wordCount: 50,
          createdAt: revisionDate,
        })),
    );
  });

  it("limita las palabras de un objetivo de libro a ese libro", async () => {
    const goals = await listGoals(session);

    const delLibro = goals.find((goal) => goal.id === "goal-a");
    const general = goals.find((goal) => goal.id === "goal-general");

    // El libro A aporta 50 palabras; el espacio de trabajo, 100 entre sus dos
    // libros. El objetivo general sí puede contarlas todas.
    expect(delLibro?.wordsWritten).toBe(50);
    expect(delLibro?.progress).toBe(50);
    expect(general?.wordsWritten).toBe(100);
    expect(general?.progress).toBe(100);

    // Cada grupo consulta solo las secciones de su ámbito.
    expect(mockPrisma.bookSection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          book: expect.objectContaining({ id: "book-a" }),
        }),
      }),
    );
    expect(mockPrisma.bookSection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          book: expect.not.objectContaining({ id: "book-a" }),
        }),
      }),
    );
  });
});
