import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  book: vi.fn(),
  sections: vi.fn(),
  characters: vi.fn(),
  persist: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./action-helpers", () => ({ beginStoryAction: mocks.start }));
vi.mock("./verified-character-storage", () => ({ persistVerifiedCharacters: mocks.persist }));
vi.mock("@/lib/db", () => ({
  prisma: {
    book: { findFirst: mocks.book },
    bookSection: { findMany: mocks.sections },
    storyCharacter: { findMany: mocks.characters },
  },
}));
import { analyzeBookCharacters } from "./character-analysis-actions";
const bookId = "11111111-1111-4111-8111-111111111111";
const source = (id: string, text: string) => ({
  id,
  title: "Capítulo",
  type: "CHAPTER",
  parentId: null,
  sortOrder: id === "a" ? 0 : 1,
  version: 2,
  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue({
    ok: true,
    session: { workspace: { id: "workspace", role: "AUTHOR" }, user: { id: "user" } },
    context: {},
  });
  mocks.book.mockResolvedValue({ title: "Novela" });
  mocks.characters.mockResolvedValue([]);
  mocks.persist.mockResolvedValue(1);
  const rows = [
    source("a", "Andrés Salazar llegó."),
    source("b", "Andrés miró la puerta. —Sí —dijo Andrés."),
  ];
  mocks.sections.mockImplementation(async ({ where }) =>
    where.id ? rows.filter((row) => where.id.in.includes(row.id)) : rows,
  );
});
it("el botón de revisión completa contrasta capítulos y persiste la identidad verificada", async () => {
  const result = await analyzeBookCharacters(bookId);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    name: "Andrés Salazar",
    mentions: 3,
    nameVerification: { surnames: "Salazar" },
  });
  expect(mocks.persist.mock.calls[0]?.[2]).toHaveLength(2);
  expect(result.candidates[0]?.evidence[0]?.sectionId).toBe("a");
});
it("rechaza libros ajenos o UUID inválidos antes de leer secciones", async () => {
  expect((await analyzeBookCharacters("invalid")).ok).toBe(false);
  mocks.book.mockResolvedValue(null);
  expect((await analyzeBookCharacters(bookId)).ok).toBe(false);
  expect(mocks.sections).not.toHaveBeenCalled();
  expect(mocks.persist).not.toHaveBeenCalled();
});
it("un capítulo vaciado sigue invalidando propuestas antiguas sin borrarlas", async () => {
  const row = source("a", "");
  mocks.sections.mockResolvedValue([row]);
  mocks.persist.mockResolvedValue(0);
  const result = await analyzeBookCharacters(bookId);
  expect(result.ok).toBe(true);
  expect(mocks.persist.mock.calls[0]?.[2]).toHaveLength(1);
  expect(mocks.persist.mock.calls[0]?.[3]).toEqual([]);
});
