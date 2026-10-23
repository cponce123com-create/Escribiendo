import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = { bookSection: { updateMany: vi.fn() }, sectionRevision: { create: vi.fn() } };
  return {
    tx,
    db: { bookSection: { findMany: vi.fn() }, $transaction: vi.fn() },
    totals: vi.fn(),
    session: { user: { id: "u" }, workspace: { id: "w", role: "OWNER" } },
  };
});
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue(mocks.session) }));
vi.mock("@/lib/security/request-context", () => ({ assertServerActionOrigin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./statistics", () => ({ recomputeBookTotals: mocks.totals }));
import { replaceBookManuscriptAction } from "./manuscript-search-actions";
const document = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "hola hola", marks: [{ type: "bold" }] }],
    },
  ],
};
describe("validated atomic manuscript replacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.workspace.role = "OWNER";
    mocks.db.bookSection.findMany.mockResolvedValue([
      { id: "s", title: "A", version: 1, content: document },
    ]);
    mocks.tx.bookSection.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.tx));
  });
  it("validates the transformed document before starting any write", async () => {
    const result = await replaceBookManuscriptAction("b", "hola", "x".repeat(500_001));
    expect(result.count).toBe(0);
    expect(result.error).toMatch(/límites/);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects illegal XML controls without creating revisions", async () => {
    expect((await replaceBookManuscriptAction("b", "hola", "\u0007")).error).toBeTruthy();
    expect(mocks.tx.sectionRevision.create).not.toHaveBeenCalled();
  });
  it("permits case corrections, preserves marks, scopes writes and totals in the transaction", async () => {
    expect(await replaceBookManuscriptAction("b", "hola", "Hola")).toEqual({ count: 2 });
    expect(mocks.tx.bookSection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookId: "b",
          version: 1,
          book: { workspaceId: "w", deletedAt: null },
        }),
        data: expect.objectContaining({
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Hola Hola", marks: [{ type: "bold" }] }],
              },
            ],
          },
        }),
      }),
    );
    expect(mocks.totals).toHaveBeenCalledWith(mocks.tx, "b");
  });
  it("aborts before recomputing totals on a concurrent version change", async () => {
    mocks.tx.bookSection.updateMany.mockResolvedValue({ count: 0 });
    expect((await replaceBookManuscriptAction("b", "hola", "adiós")).error).toMatch(/cambió/);
    expect(mocks.totals).not.toHaveBeenCalled();
  });
  it("refuses reader writes before reading content", async () => {
    mocks.session.workspace.role = "READER";
    expect((await replaceBookManuscriptAction("b", "hola", "adiós")).error).toMatch(/permisos/);
    expect(mocks.db.bookSection.findMany).not.toHaveBeenCalled();
  });
});
