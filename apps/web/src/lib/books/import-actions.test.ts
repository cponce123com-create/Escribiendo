import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildZip } from "@escribiendo/export-engine";

const { mockPrisma, mockTx, mockSession, mockRedirect, mockWriteAuditLog } = vi.hoisted(() => {
  const mockTx = {
    book: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    bookSection: {
      createMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    editorialMatter: { createMany: vi.fn() },
    sectionRevision: {
      createMany: vi.fn(),
    },
  };
  const mockPrisma = {
    ...mockTx,
    $transaction: vi.fn(),
  };
  const mockSession = {
    sessionId: "session-1",
    user: {
      id: "user-1",
      email: "author@example.com",
      name: "Ana Autora",
      role: "AUTHOR" as const,
    },
    workspace: { id: "workspace-1", name: "Estudio", slug: "estudio", role: "OWNER" as const },
    workspaces: [{ id: "workspace-1", name: "Estudio", slug: "estudio", role: "OWNER" as const }],
  };
  const mockRedirect = vi.fn();
  const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
  return { mockPrisma, mockTx, mockSession, mockRedirect, mockWriteAuditLog };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue(mockSession) }));
vi.mock("@/lib/security/request-context", () => ({
  assertServerActionOrigin: vi.fn().mockResolvedValue({ requestId: "req-1", ipHash: "hash" }),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mockWriteAuditLog }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

import { getSession } from "@/lib/auth/session";
import { importBookAction, analyzeBookImportAction } from "./import-actions";

function makeDocx(): Uint8Array {
  return buildZip(
    [
      {
        name: "word/document.xml",
        data: new TextEncoder().encode(
          '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo 1</w:t></w:r></w:p><w:p><w:r><w:t>Texto importado para probar la transacción.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo 2</w:t></w:r></w:p><w:p><w:r><w:t>Segundo texto.</w:t></w:r></w:p></w:body></w:document>',
        ),
      },
    ],
    new Date("2026-01-01T00:00:00.000Z"),
  );
}

function makeFormData(): FormData {
  const formData = new FormData();
  const bytes = makeDocx();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  formData.append("file", new File([buffer], "manuscrito.docx"));
  formData.set("authorName", "Ana Autora");
  formData.set("fingerprint", createHash("sha256").update(bytes).digest("hex"));
  formData.set(
    "sectionChoices",
    JSON.stringify(
      [0, 1].map((index) => ({
        index,
        title: `Capítulo ${index + 1}`,
        type: "CHAPTER",
        include: true,
      })),
    ),
  );
  return formData;
}

describe("importBookAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockSession);
    mockPrisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mockTx) => unknown) => callback(mockTx),
    );
    mockTx.book.create.mockResolvedValue({ id: "book-imported" });
    mockTx.bookSection.createMany.mockResolvedValue({ count: 2 });
    mockTx.sectionRevision.createMany.mockResolvedValue({ count: 2 });
    mockTx.bookSection.aggregate.mockResolvedValue({ _sum: { wordCount: 8 } });
    mockTx.bookSection.count.mockResolvedValue(2);
    mockTx.book.findUniqueOrThrow.mockResolvedValue({ targetWordCount: null });
    mockTx.book.update.mockResolvedValue({});
  });

  it("crea libro, capítulos y revisiones IMPORT dentro de una transacción y redirige", async () => {
    mockRedirect.mockImplementation((path: string) => {
      throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" });
    });

    await expect(importBookAction({ status: "idle" }, makeFormData())).rejects.toThrow(
      "/books/book-imported",
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });
    expect(mockTx.book.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          createdById: "user-1",
          title: "manuscrito",
          authorName: "Ana Autora",
          language: "es",
        }),
      }),
    );

    const sectionCreate = mockTx.bookSection.createMany.mock.calls[0]?.[0];
    expect(sectionCreate.data).toHaveLength(2);
    expect(sectionCreate.data[0]).toMatchObject({
      id: expect.any(String),
      bookId: "book-imported",
      type: "CHAPTER",
      title: "Capítulo 1",
      sortOrder: 0,
      version: 1,
    });

    const revisionCreate = mockTx.sectionRevision.createMany.mock.calls[0]?.[0];
    expect(revisionCreate.data).toHaveLength(2);
    expect(revisionCreate.data[0]).toMatchObject({
      sectionId: sectionCreate.data[0].id,
      createdById: "user-1",
      reason: "IMPORT",
      version: 1,
    });
    expect(mockTx.book.update).toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BOOK_IMPORTED",
        entityType: "Book",
        entityId: "book-imported",
        metadata: { format: "docx", sectionCount: 2 },
      }),
      expect.objectContaining({ requestId: "req-1" }),
    );
  });

  it("rechaza a quienes no tienen permiso para crear libros antes de procesar el archivo", async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...mockSession,
      workspace: { ...mockSession.workspace, role: "REVIEWER" },
    });

    const result = await importBookAction({ status: "idle" }, new FormData());

    expect(result.status).toBe("error");
    expect(result.message).toContain("permisos");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("la revisión previa no crea libros ni revisiones", async () => {
    mockPrisma.$transaction.mockClear();
    const result = await analyzeBookImportAction(makeFormData());
    expect(result.status).toBe("success");
    expect(result.preview?.sections).toHaveLength(2);
    expect(result.preview?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it("rechaza una revisión de otro archivo y no inventa autoría", async () => {
    mockPrisma.$transaction.mockClear();
    const form = makeFormData();
    const preview = (await analyzeBookImportAction(form)).preview!;
    form.set("fingerprint", "otro-archivo");
    form.set(
      "sectionChoices",
      JSON.stringify(
        preview.sections.map((section) => ({
          index: section.index,
          title: section.title,
          type: section.type,
          include: true,
        })),
      ),
    );
    expect((await importBookAction({ status: "idle" }, form)).message).toContain("archivo cambió");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    form.delete("authorName");
    expect(
      (await importBookAction({ status: "idle" }, form)).fieldErrors?.authorName,
    ).toBeDefined();
  });
  it("respeta la selección y clasifica página legal original como materia manual", async () => {
    mockPrisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mockTx) => unknown) => callback(mockTx),
    );
    mockTx.book.create.mockResolvedValue({ id: "book-imported" });
    mockTx.bookSection.aggregate.mockResolvedValue({ _sum: { wordCount: 8 } });
    mockTx.bookSection.count.mockResolvedValue(0);
    mockTx.book.findUniqueOrThrow.mockResolvedValue({ targetWordCount: null });
    mockRedirect.mockImplementation((path: string) => {
      throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" });
    });
    const form = makeFormData();
    const preview = (await analyzeBookImportAction(form)).preview!;
    form.set("fingerprint", preview.fingerprint);
    form.set(
      "sectionChoices",
      JSON.stringify(
        preview.sections.map((section) => ({
          index: section.index,
          title: section.index === 0 ? "Mi página legal" : section.title,
          type: section.index === 0 ? "COPYRIGHT" : section.type,
          include: section.index === 0,
        })),
      ),
    );
    await expect(importBookAction({ status: "idle" }, form)).rejects.toThrow(
      "/books/book-imported",
    );
    expect(mockTx.bookSection.createMany.mock.lastCall?.[0].data).toHaveLength(1);
    expect(mockTx.bookSection.createMany.mock.lastCall?.[0].data[0]).toMatchObject({
      type: "COPYRIGHT",
      title: "Mi página legal",
      showInToc: false,
    });
    expect(mockTx.editorialMatter.createMany.mock.lastCall?.[0].data[0]).toMatchObject({
      kind: "COPYRIGHT",
      mode: "MANUAL",
      bookId: "book-imported",
    });
  });
});
