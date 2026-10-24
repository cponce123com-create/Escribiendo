import { beforeEach, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
const mocks = vi.hoisted(() => ({ book: vi.fn(), tree: vi.fn(), sections: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/books/queries", () => ({ getBook: mocks.book, getSectionTree: mocks.tree }));
vi.mock("@/lib/db", () => ({ prisma: { bookSection: { findMany: mocks.sections } } }));
import { analyzeBookEditorially } from "./editorial-analysis";
const session = { user: { id: "user" }, workspace: { id: "workspace" } } as SessionContext;
const node = (id: string, children: unknown[] = []) => ({
  id,
  title: id,
  type: "CHAPTER",
  version: 1,
  sortOrder: 0,
  parentId: null,
  wordCount: 3,
  children,
});
const row = (id: string) => ({
  id,
  title: id,
  type: "CHAPTER",
  version: 1,
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "María decidió subir arriba." }] },
    ],
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.book.mockResolvedValue({ id: "book", title: "Libro" });
  mocks.tree.mockResolvedValue([node("one"), node("two")]);
  mocks.sections.mockImplementation(async ({ where }) => where.id.in.map(row));
});
it("limita el contenido consultado a la selección autorizada", async () => {
  const result = await analyzeBookEditorially(session, "book", { sectionId: "one" });
  expect(result?.sectionsAnalyzed).toBe(1);
  expect(result?.readability.map((section) => section.sectionId)).toEqual(["one"]);
  expect(mocks.sections).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["one"] },
        bookId: "book",
        book: { workspaceId: "workspace", deletedAt: null },
      }),
    }),
  );
});
it("rechaza un ID ajeno sin consultar texto del manuscrito", async () => {
  expect(await analyzeBookEditorially(session, "book", { sectionId: "foreign" })).toBeNull();
  expect(mocks.sections).not.toHaveBeenCalled();
});
it("aplica las preferencias antes de calcular hallazgos", async () => {
  const before = await analyzeBookEditorially(session, "book", { sectionId: "one" });
  expect(before?.styleFindings.some((finding) => finding.matchedText === "subir arriba")).toBe(
    true,
  );
  const after = await analyzeBookEditorially(session, "book", {
    sectionId: "one",
    disabledRules: ["es.style.known-redundancies"],
  });
  expect(after?.styleFindings.some((finding) => finding.matchedText === "subir arriba")).toBe(
    false,
  );
});
it("no consulta árbol ni contenido de un libro ajeno", async () => {
  mocks.book.mockResolvedValue(null);
  expect(await analyzeBookEditorially(session, "foreign")).toBeNull();
  expect(mocks.tree).not.toHaveBeenCalled();
  expect(mocks.sections).not.toHaveBeenCalled();
});
