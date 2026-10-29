import { beforeEach, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
const m = vi.hoisted(() => ({
  book: vi.fn(),
  sections: vi.fn(),
  characters: vi.fn(),
  worlds: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    book: { findFirst: m.book },
    bookSection: { findMany: m.sections },
    storyCharacter: { findMany: m.characters },
    storyWorld: { findMany: m.worlds },
  },
}));
import { loadWritingPlanning } from "./queries";
const session = { workspace: { id: "estudio" } } as SessionContext;
beforeEach(() => {
  vi.clearAllMocks();
  m.book.mockResolvedValue({
    id: "libro",
    title: "Título",
    authorName: "Autora",
    genre: null,
    writingBriefs: [],
  });
  m.sections.mockResolvedValue([]);
  m.characters.mockResolvedValue([]);
  m.worlds.mockResolvedValue([]);
});
it("restringe el libro al espacio de sesión y no consulta fichas si el libro es ajeno", async () => {
  m.book.mockResolvedValue(null);
  expect(await loadWritingPlanning(session, "ajeno")).toBeNull();
  expect(m.book).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "ajeno", workspaceId: "estudio", deletedAt: null } }),
  );
  expect(m.sections).not.toHaveBeenCalled();
  expect(m.characters).not.toHaveBeenCalled();
});
it("conserva orden editorial y no necesita cargar el texto del manuscrito", async () => {
  m.sections.mockResolvedValue([
    { id: "cap", title: "Capítulo", type: "CHAPTER", sortOrder: 0, version: 1, writingBriefs: [] },
    { id: "pro", title: "Prólogo", type: "PROLOGUE", sortOrder: 99, version: 1, writingBriefs: [] },
  ]);
  const data = await loadWritingPlanning(session, "libro");
  expect(data?.sections.map((s) => s.id)).toEqual(["pro", "cap"]);
  expect(m.sections.mock.calls[0]![0].select).not.toHaveProperty("content");
});
it("rechaza un conjunto incompleto en lugar de omitir secciones", async () => {
  m.sections.mockResolvedValue(
    Array.from({ length: 201 }, (_, i) => ({ id: String(i), writingBriefs: [] })),
  );
  await expect(loadWritingPlanning(session, "libro")).rejects.toThrow("incompleto");
});
it("la firma del formulario cambia si se actualizan las fichas disponibles", async () => {
  const before = await loadWritingPlanning(session, "libro");
  m.characters.mockResolvedValue([
    { id: "c", name: "Ana", summary: "Ahora es otra ficha", aliases: [] },
  ]);
  const after = await loadWritingPlanning(session, "libro");
  expect(before?.sourceKey).not.toBe(after?.sourceKey);
});
