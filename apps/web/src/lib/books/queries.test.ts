import { describe, expect, it, vi, beforeEach } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

const { mockPrisma, mockSession } = vi.hoisted(() => {
  const mockPrisma = {
    book: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    bookSection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    sectionRevision: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  const mockSession = {
    sessionId: "session-1",
    user: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "AUTHOR" as const,
    },
    workspace: {
      id: "workspace-1",
      name: "Test Workspace",
      slug: "test",
      role: "OWNER" as const,
    },
    workspaces: [
      { id: "workspace-1", name: "Test Workspace", slug: "test", role: "OWNER" as const },
    ],
  } satisfies SessionContext;

  return { mockPrisma, mockSession };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue(mockSession),
}));

vi.mock("@/lib/books/covers", () => ({
  getBookCovers: vi.fn().mockResolvedValue(new Map()),
}));

import {
  listBooks,
  countBooks,
  getBook,
  getSectionTree,
  getSection,
  listRevisions,
  getRevisionContent,
} from "./queries";

describe("books queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeBook(overrides = {}) {
    return {
      id: "book-1",
      title: "Test Book",
      subtitle: null,
      authorName: "Test Author",
      penName: null,
      status: "DRAFT",
      genre: null,
      language: "es",
      targetWordCount: 50000,
      wordCount: 10000,
      chapterCount: 5,
      writingProgress: 20.0,
      updatedAt: new Date(),
      createdAt: new Date(),
      _count: { sections: 3 },
      ...overrides,
    };
  }

  function makeSection(overrides = {}) {
    return {
      id: "section-1",
      parentId: null,
      type: "CHAPTER",
      title: "Chapter 1",
      sortOrder: 0,
      wordCount: 2000,
      version: 1,
      ...overrides,
    };
  }

  describe("listBooks", () => {
    it("filtra por workspaceId de la sesión", async () => {
      mockPrisma.book.findMany.mockResolvedValue([makeBook()]);

      await listBooks(mockSession, {});

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: "workspace-1", deletedAt: null }),
        }),
      );
    });

    it("aplica filtro de estado", async () => {
      mockPrisma.book.findMany.mockResolvedValue([makeBook({ status: "COMPLETE" })]);

      await listBooks(mockSession, { status: "COMPLETE" });

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "COMPLETE" }),
        }),
      );
    });

    it("aplica búsqueda case-insensitive en múltiples campos", async () => {
      mockPrisma.book.findMany.mockResolvedValue([makeBook({ title: "Mi Libro" })]);

      await listBooks(mockSession, { search: "mi libro" });

      const call = mockPrisma.book.findMany.mock.calls[0]![0];
      expect(call.where).toHaveProperty("OR");
      const orConditions = call.where.OR;
      expect(orConditions).toHaveLength(5);
      expect(
        orConditions.some(
          (c: { title?: { contains?: string } }) => c.title?.contains === "mi libro",
        ),
      ).toBe(true);
    });

    it("ordena por reciente por defecto", async () => {
      mockPrisma.book.findMany.mockResolvedValue([makeBook()]);

      await listBooks(mockSession, { sort: "recent" });

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ updatedAt: "desc" }],
        }),
      );
    });

    it("ordena por título", async () => {
      mockPrisma.book.findMany.mockResolvedValue([makeBook()]);

      await listBooks(mockSession, { sort: "title" });

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ title: "asc" }],
        }),
      );
    });

    it("ordena por palabras descendente", async () => {
      mockPrisma.book.findMany.mockResolvedValue([makeBook()]);

      await listBooks(mockSession, { sort: "words" });

      expect(mockPrisma.book.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ wordCount: "desc" }, { title: "asc" }],
        }),
      );
    });
  });

  describe("countBooks", () => {
    it("cuenta solo libros no eliminados del workspace", async () => {
      mockPrisma.book.count.mockResolvedValue(5);

      const count = await countBooks(mockSession);

      expect(mockPrisma.book.count).toHaveBeenCalledWith({
        where: { workspaceId: "workspace-1", deletedAt: null },
      });
      expect(count).toBe(5);
    });
  });

  describe("getBook", () => {
    it("retorna null si el libro no existe en el workspace", async () => {
      mockPrisma.book.findFirst.mockResolvedValue(null);

      const book = await getBook(mockSession, "book-999");

      expect(book).toBeNull();
      expect(mockPrisma.book.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "book-999", workspaceId: "workspace-1", deletedAt: null },
        }),
      );
    });

    it("retorna el libro con progreso numérico y portada", async () => {
      mockPrisma.book.findFirst.mockResolvedValue(makeBook({ writingProgress: 33.33 }));

      const book = await getBook(mockSession, "book-1");

      expect(book).not.toBeNull();
      expect(book?.writingProgress).toBe(33.33);
    });
  });

  describe("getSectionTree", () => {
    it("construye árbol desde lista plana", async () => {
      const sections = [
        makeSection({ id: "part-1", type: "PART", sortOrder: 0 }),
        makeSection({ id: "ch-1", parentId: "part-1", sortOrder: 0 }),
        makeSection({ id: "ch-2", parentId: "part-1", sortOrder: 1 }),
      ];
      mockPrisma.bookSection.findMany.mockResolvedValue(sections);

      const tree = await getSectionTree(mockSession, "book-1");

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe("part-1");
      expect(tree[0]?.children).toHaveLength(2);
      expect(tree[0]?.children[0]?.id).toBe("ch-1");
      expect(tree[0]?.children[1]?.id).toBe("ch-2");
    });

    it("ordena hijos por sortOrder y título", async () => {
      const sections = [
        makeSection({ id: "p", type: "PART", sortOrder: 0, title: "Parte" }),
        makeSection({ id: "a", parentId: "p", sortOrder: 1, title: "Zeta" }),
        makeSection({ id: "b", parentId: "p", sortOrder: 1, title: "Alfa" }),
        makeSection({ id: "c", parentId: "p", sortOrder: 0, title: "Beta" }),
      ];
      mockPrisma.bookSection.findMany.mockResolvedValue(sections);

      const tree = await getSectionTree(mockSession, "book-1");

      expect(tree[0]?.children.map((n) => n.id)).toEqual(["c", "b", "a"]);
    });

    it("filtra por el workspace de la sesión", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([]);

      await getSectionTree(mockSession, "book-1");

      expect(mockPrisma.bookSection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bookId: "book-1",
            book: { workspaceId: "workspace-1", deletedAt: null },
          }),
        }),
      );
    });
  });

  describe("getSection - prevención IDOR cross-book", () => {
    it("valida que la sección pertenezca al bookId indicado", async () => {
      mockPrisma.bookSection.findFirst.mockResolvedValue(null);

      const section = await getSection(mockSession, "book-1", "section-999");

      expect(section).toBeNull();
      expect(mockPrisma.bookSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "section-999",
            bookId: "book-1",
            deletedAt: null,
            book: { workspaceId: "workspace-1", deletedAt: null },
          }),
        }),
      );
    });

    it("retorna la sección si pertenece al libro y workspace", async () => {
      mockPrisma.bookSection.findFirst.mockResolvedValue(makeSection({ bookId: "book-1" }));

      const section = await getSection(mockSession, "book-1", "section-1");

      expect(section).not.toBeNull();
      expect(section?.bookId).toBe("book-1");
    });
  });

  describe("listRevisions", () => {
    it("valida pertenencia a libro y workspace", async () => {
      mockPrisma.sectionRevision.findMany.mockResolvedValue([]);

      await listRevisions(mockSession, "book-1", "section-1");

      expect(mockPrisma.sectionRevision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sectionId: "section-1",
            section: {
              deletedAt: null,
              book: { id: "book-1", workspaceId: "workspace-1", deletedAt: null },
            },
          }),
        }),
      );
    });
  });

  describe("getRevisionContent", () => {
    it("valida pertenencia a libro y workspace", async () => {
      mockPrisma.sectionRevision.findFirst.mockResolvedValue(null);

      const rev = await getRevisionContent(mockSession, "book-1", "rev-999");

      expect(rev).toBeNull();
      expect(mockPrisma.sectionRevision.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "rev-999",
            section: {
              deletedAt: null,
              book: { id: "book-1", workspaceId: "workspace-1", deletedAt: null },
            },
          }),
        }),
      );
    });
  });
});
