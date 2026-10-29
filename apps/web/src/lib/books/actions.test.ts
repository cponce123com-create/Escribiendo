import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockPrisma, mockSession, mockContext } = vi.hoisted(() => {
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
  };

  const mockContext = {
    requestId: "req-1",
    ip: "127.0.0.1",
    ipHash: "hash",
    userAgent: "test-agent",
  };

  return { mockPrisma, mockSession, mockContext };
});

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

import {
  createBookAction,
  createSectionAction,
  deleteSectionAction,
  moveSectionAction,
  saveSectionAction,
  updateBookAction,
  updateSectionOptionsAction,
} from "./actions";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { redirect } from "next/navigation";

describe("books actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `restoreMocks` limpia las implementaciones entre pruebas: se reponen
    // aquí para que cada caso parta de una sesión y un contexto válidos.
    vi.mocked(getSession).mockResolvedValue(mockSession);
    vi.mocked(assertServerActionOrigin).mockResolvedValue(mockContext);
  });

  function makeFormData(data: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(data)) {
      fd.append(key, value);
    }
    return fd;
  }

  // Las acciones validan los identificadores con `uuidSchema`: los casos deben
  // usar UUID reales, no cadenas de ejemplo.
  const ids = {
    book: "11111111-1111-4111-8111-111111111111",
    section: "22222222-2222-4222-8222-222222222222",
    parent: "33333333-3333-4333-8333-333333333333",
    sibling1: "44444444-4444-4444-8444-444444444444",
    sibling2: "55555555-5555-4555-8555-555555555555",
    otherParent: "66666666-6666-4666-8666-666666666666",
    child: "77777777-7777-4777-8777-777777777777",
  } as const;

  describe("saveSectionAction: reintentos", () => {
    const document = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Texto persistido." }] }],
    };

    it("confirma un reintento idéntico sin otra revisión aunque JSONB cambie el orden de claves", async () => {
      mockPrisma.bookSection.findFirst.mockResolvedValue({
        id: ids.section,
        bookId: ids.book,
        title: "Capítulo",
        version: 5,
        content: {
          content: [{ content: [{ text: "Texto persistido.", type: "text" }], type: "paragraph" }],
          type: "doc",
        },
      });
      const result = await saveSectionAction(
        { status: "idle" },
        makeFormData({
          sectionId: ids.section,
          version: "4",
          content: JSON.stringify(document),
          intent: "manual",
        }),
      );
      expect(result).toMatchObject({
        status: "success",
        savedVersion: 5,
        conflict: null,
        throttled: false,
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.sectionRevision.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.characterAnalysisTask.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.bookSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            book: { workspaceId: mockSession.workspace.id, deletedAt: null },
          }),
        }),
      );
    });

    it("mantiene el conflicto para textos diferentes y no sobrescribe el servidor", async () => {
      mockPrisma.bookSection.findFirst.mockResolvedValue({
        id: ids.section,
        bookId: ids.book,
        title: "Capítulo",
        version: 5,
        content: document,
      });
      mockPrisma.sectionRevision.findFirst.mockResolvedValue(null);
      const result = await saveSectionAction(
        { status: "idle" },
        makeFormData({
          sectionId: ids.section,
          version: "4",
          content: JSON.stringify({ type: "doc", content: [] }),
        }),
      );
      expect(result.conflict?.serverVersion).toBe(5);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("updateSectionOptionsAction", () => {
    it("guarda opciones solo en el libro y espacio de trabajo autorizados", async () => {
      mockPrisma.bookSection.findFirst.mockResolvedValue({ id: ids.section, bookId: ids.book });
      mockPrisma.bookSection.updateMany.mockResolvedValue({ count: 1 });
      const result = await updateSectionOptionsAction(
        { status: "idle" },
        makeFormData({
          sectionId: ids.section,
          showInToc: "on",
          startOnOddPage: "on",
        }),
      );
      expect(result.status).toBe("success");
      expect(mockPrisma.bookSection.updateMany).toHaveBeenCalledWith({
        where: {
          id: ids.section,
          bookId: ids.book,
          deletedAt: null,
          book: { workspaceId: mockSession.workspace.id, deletedAt: null },
        },
        data: {
          includeInExport: false,
          showInToc: true,
          pageBreakBefore: false,
          startOnOddPage: true,
        },
      });
    });
    it("rechaza un lector sin leer ni escribir la sección", async () => {
      vi.mocked(getSession).mockResolvedValue({
        ...mockSession,
        workspace: { ...mockSession.workspace, role: "REVIEWER" },
      });
      const result = await updateSectionOptionsAction(
        { status: "idle" },
        makeFormData({ sectionId: ids.section }),
      );
      expect(result.status).toBe("error");
      expect(mockPrisma.bookSection.updateMany).not.toHaveBeenCalled();
    });
  });

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

      await createBookAction({ status: "idle" }, formData);

      expect(mockPrisma.book.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Mi Libro",
            authorName: "Autor Test",
            language: "es",
            workspaceId: "workspace-1",
            createdById: "user-1",
          }),
        }),
      );
      // La acción redirige a la ficha del libro. En Next.js `redirect` corta
      // la ejecución: no existe un estado de éxito que devolver.
      expect(redirect).toHaveBeenCalledWith(`/books/${bookId}`);
    });

    it("rechaza si el usuario no tiene permisos", async () => {
      vi.mocked(getSession).mockResolvedValueOnce({
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

  describe("moveSectionAction", () => {
    const bookId = ids.book;

    function sectionRow(overrides: Record<string, unknown> = {}) {
      return {
        id: ids.section,
        bookId,
        parentId: null,
        title: "Sección",
        version: 1,
        content: {},
        ...overrides,
      };
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
        cb(mockPrisma),
      );
      mockPrisma.bookSection.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bookSection.findMany.mockResolvedValue([]);
    });

    it("mueve dentro del mismo libro, cambia de padre y renumera el orden", async () => {
      mockPrisma.bookSection.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) => {
          if (where.id === ids.section) {
            return sectionRow();
          }

          if (where.id === ids.parent) {
            return { id: ids.parent, bookId, parentId: null };
          }

          return null;
        },
      );
      mockPrisma.bookSection.findMany.mockResolvedValue([
        { id: ids.sibling1, title: "A", type: "CHAPTER", parentId: ids.parent, sortOrder: 0 },
        { id: ids.sibling2, title: "B", type: "CHAPTER", parentId: ids.parent, sortOrder: 1 },
      ]);

      const result = await moveSectionAction(
        { status: "idle" },
        makeFormData({ sectionId: ids.section, parentId: ids.parent, position: "1" }),
      );

      expect(result.status).toBe("success");
      expect(mockPrisma.bookSection.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: ids.sibling1, bookId, deletedAt: null },
        data: { sortOrder: 0 },
      });
      expect(mockPrisma.bookSection.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: ids.section, bookId, deletedAt: null },
        data: { sortOrder: 1, parentId: ids.parent },
      });
      expect(mockPrisma.bookSection.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: ids.sibling2, bookId, deletedAt: null },
        data: { sortOrder: 2 },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
        timeout: 15_000,
      });
    });

    it("rechaza un padre que no pertenece al mismo libro", async () => {
      mockPrisma.bookSection.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) =>
          where.id === ids.section ? sectionRow() : null,
      );

      const result = await moveSectionAction(
        { status: "idle" },
        makeFormData({ sectionId: ids.section, parentId: ids.otherParent, position: "0" }),
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("no pertenece a este libro");
      expect(mockPrisma.bookSection.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.bookSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: ids.otherParent,
            bookId,
            deletedAt: null,
          }),
        }),
      );
    });

    it("rechaza mover una sección bajo una descendiente suya", async () => {
      mockPrisma.bookSection.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) => {
          if (where.id === ids.section) {
            return sectionRow();
          }

          if (where.id === ids.child) {
            return { id: ids.child, bookId, parentId: ids.section };
          }

          return null;
        },
      );

      const result = await moveSectionAction(
        { status: "idle" },
        makeFormData({ sectionId: ids.section, parentId: ids.child, position: "0" }),
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("descendientes");
      expect(mockPrisma.bookSection.updateMany).not.toHaveBeenCalled();
    });

    it("reintenta si PostgreSQL aborta por conflicto de serialización", async () => {
      let attempts = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => {
        attempts += 1;
        const value = await cb(mockPrisma);

        if (attempts === 1) {
          throw Object.assign(new Error("conflicto"), { code: "P2034" });
        }

        return value;
      });
      mockPrisma.bookSection.findFirst.mockImplementation(
        async ({ where }: { where: { id?: string } }) =>
          where.id === ids.section ? sectionRow() : null,
      );
      mockPrisma.bookSection.findMany.mockResolvedValue([{ id: ids.sibling1 }]);

      const result = await moveSectionAction(
        { status: "idle" },
        makeFormData({ sectionId: ids.section, position: "0" }),
      );

      expect(result.status).toBe("success");
      expect(attempts).toBe(2);
    });
  });

  describe("createSectionAction", () => {
    it.each(["TABLE_OF_CONTENTS", "COPYRIGHT"])(
      "rechaza la sección automática %s",
      async (type) => {
        const result = await createSectionAction(
          { status: "idle" },
          makeFormData({
            bookId: ids.book,
            title: "Automática",
            type,
          }),
        );
        expect(result.status).toBe("error");
        expect(result.message).toBe("El índice y la página de derechos se generan solos");
        expect(mockPrisma.bookSection.create).not.toHaveBeenCalled();
      },
    );
    it("rechaza un padre de otro libro y no crea la sección", async () => {
      mockPrisma.book.findFirst.mockResolvedValue({ id: ids.book });
      mockPrisma.bookSection.findFirst.mockResolvedValue(null);

      const result = await createSectionAction(
        { status: "idle" },
        makeFormData({
          bookId: ids.book,
          title: "Capítulo",
          type: "CHAPTER",
          parentId: ids.otherParent,
        }),
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("no existe en este libro");
      expect(mockPrisma.bookSection.create).not.toHaveBeenCalled();
      expect(mockPrisma.bookSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: ids.otherParent,
            bookId: ids.book,
            deletedAt: null,
          }),
        }),
      );
    });

    it("recalcula los totales del libro al crear una sección", async () => {
      mockPrisma.book.findFirst.mockResolvedValue({ id: ids.book });
      mockPrisma.bookSection.findFirst.mockResolvedValue(null);
      mockPrisma.bookSection.create.mockResolvedValue({ id: ids.section });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
        cb(mockPrisma),
      );
      mockPrisma.bookSection.aggregate.mockResolvedValue({ _sum: { wordCount: 0 } });
      mockPrisma.bookSection.count.mockResolvedValue(3);
      mockPrisma.book.findUniqueOrThrow.mockResolvedValue({ targetWordCount: 50_000 });
      mockPrisma.book.update.mockResolvedValue({});

      await createSectionAction(
        { status: "idle" },
        makeFormData({ bookId: ids.book, title: "Capítulo", type: "CHAPTER" }),
      );

      expect(mockPrisma.bookSection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookId: ids.book, type: "CHAPTER" }),
        }),
      );
      // La ficha del libro debe ver el capítulo nuevo sin esperar al próximo
      // guardado del manuscrito.
      expect(mockPrisma.book.update).toHaveBeenCalledWith({
        where: { id: ids.book },
        data: { wordCount: 0, chapterCount: 3, writingProgress: 0 },
      });
      expect(redirect).toHaveBeenCalledWith(`/books/${ids.book}/sections/${ids.section}`);
    });
  });

  describe("updateBookAction", () => {
    it("recalcula el progreso cuando cambia el objetivo de palabras", async () => {
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
        cb(mockPrisma),
      );
      mockPrisma.book.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bookSection.aggregate.mockResolvedValue({ _sum: { wordCount: 50_000 } });
      mockPrisma.bookSection.count.mockResolvedValue(10);
      mockPrisma.book.findUniqueOrThrow.mockResolvedValue({ targetWordCount: 60_000 });
      mockPrisma.book.update.mockResolvedValue({});

      const result = await updateBookAction(
        { status: "idle" },
        makeFormData({
          bookId: ids.book,
          title: "Mi libro",
          authorName: "Autor",
          language: "es",
          targetWordCount: "60000",
        }),
      );

      expect(result.status).toBe("success");
      expect(mockPrisma.book.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetWordCount: 60_000 }),
        }),
      );
      // 50.000 palabras sobre un objetivo de 60.000 son un 83,33 %, no el
      // porcentaje que se calculó con el objetivo anterior.
      expect(mockPrisma.book.update).toHaveBeenCalledWith({
        where: { id: ids.book },
        data: { wordCount: 50_000, chapterCount: 10, writingProgress: 83.33 },
      });
    });
  });

  describe("deleteSectionAction", () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
        cb(mockPrisma),
      );
      mockPrisma.bookSection.aggregate.mockResolvedValue({ _sum: { wordCount: 0 } });
      mockPrisma.bookSection.count.mockResolvedValue(0);
      mockPrisma.book.findUniqueOrThrow.mockResolvedValue({ targetWordCount: null });
      mockPrisma.book.update.mockResolvedValue({});
    });

    it("borra la sección y sus descendientes solo dentro del libro", async () => {
      mockPrisma.bookSection.findFirst.mockResolvedValue({
        id: ids.section,
        bookId: ids.book,
        title: "S1",
        version: 1,
        content: {},
      });
      mockPrisma.bookSection.findMany
        .mockResolvedValueOnce([{ id: ids.child }])
        .mockResolvedValueOnce([]);

      await deleteSectionAction({ status: "idle" }, makeFormData({ sectionId: ids.section }));

      expect(mockPrisma.bookSection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { parentId: ids.section, bookId: ids.book, deletedAt: null },
        }),
      );
      expect(mockPrisma.bookSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [ids.section, ids.child] },
            bookId: ids.book,
            deletedAt: null,
          }),
        }),
      );
      expect(redirect).toHaveBeenCalledWith(`/books/${ids.book}`);
    });
  });
});

describe("actions - smoke imports", () => {
  it("importa sin errores", () => {
    expect(true).toBe(true);
  });
});
