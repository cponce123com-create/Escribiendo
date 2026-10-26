import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  origin: vi.fn(),
  book: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/security/request-context", () => ({ assertServerActionOrigin: mocks.origin }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/db", () => ({
  prisma: {
    book: { findFirst: mocks.book },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        laboratoryReviewState: {
          findUnique: mocks.find,
          updateMany: mocks.update,
          create: mocks.create,
        },
      }),
  },
}));
import { saveLaboratoryReviewAction } from "./laboratory-review-actions";
import { reviewKey } from "./laboratory-review";
const bookId = "11111111-1111-4111-8111-111111111111",
  key = `escribiendo:analysis-ignore:user:${bookId}:style:fixture`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.origin.mockResolvedValue({});
  mocks.session.mockResolvedValue({
    user: { id: "user" },
    workspace: { id: "workspace", role: "AUTHOR" },
  });
  mocks.book.mockResolvedValue({ id: bookId });
  mocks.find.mockResolvedValue(null);
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({ count: 1 });
});
it("rechaza origen y permisos antes de consultar libros", async () => {
  mocks.origin.mockRejectedValueOnce(new Error());
  expect((await saveLaboratoryReviewAction({ bookId, key, status: "ignored" })).status).toBe(
    "error",
  );
  mocks.session.mockResolvedValueOnce({
    user: { id: "user" },
    workspace: { id: "workspace", role: "READER" },
  });
  expect((await saveLaboratoryReviewAction({ bookId, key, status: "ignored" })).status).toBe(
    "error",
  );
  expect(mocks.book).not.toHaveBeenCalled();
});
it("no escribe decisiones de otro usuario ni libros ajenos", async () => {
  expect(
    (
      await saveLaboratoryReviewAction({
        bookId,
        key: key.replace(":user:", ":other:"),
        status: "ignored",
      })
    ).status,
  ).toBe("error");
  mocks.book.mockResolvedValue(null);
  expect((await saveLaboratoryReviewAction({ bookId, key, status: "ignored" })).status).toBe(
    "error",
  );
  expect(mocks.create).not.toHaveBeenCalled();
});
it("guarda en la cuenta sin guardar texto de manuscrito ni claves sin hash", async () => {
  expect((await saveLaboratoryReviewAction({ bookId, key, status: "intentional" })).status).toBe(
    "success",
  );
  expect(mocks.create).toHaveBeenCalledWith({
    data: {
      workspaceId: "workspace",
      bookId,
      userId: "user",
      decisions: { [reviewKey(key)]: "intentional" },
    },
  });
});
it("reintenta un conflicto sin sobrescribir decisiones concurrentes", async () => {
  mocks.find
    .mockResolvedValueOnce({ id: "r", version: 1, decisions: { old: "ignored" } })
    .mockResolvedValueOnce({
      id: "r",
      version: 2,
      decisions: { old: "ignored", concurrent: "resolved" },
    });
  mocks.update.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
  expect((await saveLaboratoryReviewAction({ bookId, key, status: "resolved" })).status).toBe(
    "success",
  );
  expect(mocks.update.mock.calls[1]?.[0]).toMatchObject({
    where: { version: 2 },
    data: { decisions: { old: "ignored", concurrent: "resolved", [reviewKey(key)]: "resolved" } },
  });
});
it("importa decisiones locales sin reemplazar una decisión ya sincronizada", async () => {
  mocks.find.mockResolvedValue({ id: "r", version: 3, decisions: { [reviewKey(key)]: "open" } });
  const other = `${key}-other`;
  expect(
    (
      await saveLaboratoryReviewAction({
        bookId,
        legacy: [
          { key, status: "ignored" },
          { key: other, status: "intentional" },
        ],
      })
    ).status,
  ).toBe("success");
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        decisions: { [reviewKey(key)]: "open", [reviewKey(other)]: "intentional" },
      }),
    }),
  );
});
