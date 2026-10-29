import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  start: vi.fn(),
  load: vi.fn(),
  book: vi.fn(),
  rows: vi.fn(),
  master: vi.fn(),
  createMaster: vi.fn(),
  createChapter: vi.fn(),
  audit: vi.fn(),
  origin: vi.fn(),
  session: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../action-helpers", () => ({ beginStoryAction: m.start }));
vi.mock("./queries", () => ({ loadWritingPlanning: m.load }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: m.audit }));
vi.mock("@/lib/security/request-context", () => ({ assertServerActionOrigin: m.origin }));
vi.mock("@/lib/auth/session", () => ({ getSession: m.session }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        book: { findFirst: m.book },
        bookSection: { findMany: m.rows },
        bookWritingBrief: { create: m.createMaster, findFirst: m.master },
        chapterWritingBrief: { create: m.createChapter },
      }),
  },
}));
import { saveWritingBriefAction, getWritingGuideAction } from "./actions";
const bookId = "11111111-1111-4111-8111-111111111111",
  sectionId = "22222222-2222-4222-8222-222222222222";
const sourceKey = "a".repeat(64);
const book = { id: bookId, title: "Libro", authorName: "Autora", genre: "Novela" };
const masterContent = {
  premise: "Inicio",
  rules: "Respetar los títulos",
  literaryMovement: "",
  narrator: "",
  tense: "",
  tone: "",
  audience: "",
  title: book.title,
  author: book.authorName,
  genre: book.genre,
  sections: [{ id: sectionId, title: "El regreso" }],
};
const chapterContent = {
  objective: "Decidir",
  startingPoint: "",
  scenes: "Conversación",
  endingPoint: "Decisión",
  restrictions: "",
  characterNotes: "",
  writtenSummary: "",
  characterIds: [],
  worldIds: [],
  title: "El regreso",
  masterVersion: 1,
  sourceVersion: 3,
  context: "",
};
function form(section = false, overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const fields = section
    ? Object.fromEntries(Object.entries(chapterContent).filter(([, v]) => typeof v === "string"))
    : masterContent;
  for (const [key, value] of Object.entries({
    ...fields,
    bookId,
    sectionId: section ? sectionId : "",
    version: section ? "0" : "1",
    masterVersion: "1",
    sourceVersion: section ? "3" : "0",
    sourceKey,
    status: "APPROVED",
    ...overrides,
  }))
    if (typeof value === "string") fd.set(key, value);
  return fd;
}
beforeEach(() => {
  vi.clearAllMocks();
  const session = { user: { id: "u" }, workspace: { id: "w", role: "AUTHOR" } };
  m.start.mockResolvedValue({ ok: true, session, context: {} });
  m.session.mockResolvedValue(session);
  m.load.mockResolvedValue({
    book,
    sourceKey,
    master: { version: 1, status: "APPROVED", content: structuredClone(masterContent) },
    sections: [
      {
        id: sectionId,
        title: "El regreso",
        type: "CHAPTER",
        parentId: null,
        sortOrder: 0,
        version: 3,
        brief: null,
      },
    ],
    characters: [],
    worlds: [],
  });
  m.book.mockResolvedValue(book);
  m.rows.mockResolvedValue([{ id: sectionId, title: "El regreso", type: "CHAPTER", version: 3 }]);
  m.master.mockResolvedValue({ version: 1 });
  m.createMaster.mockResolvedValue({});
  m.createChapter.mockResolvedValue({});
});
it("respeta el rechazo del origen o de permisos antes de leer el libro", async () => {
  m.start.mockResolvedValue({ ok: false, state: { status: "error", message: "Sin permiso" } });
  expect((await saveWritingBriefAction({ status: "idle" }, form())).status).toBe("error");
  expect(m.load).not.toHaveBeenCalled();
});
it("un libro de otro espacio no puede recibir revisiones ni guías", async () => {
  m.load.mockResolvedValue(null);
  expect((await saveWritingBriefAction({ status: "idle" }, form())).status).toBe("error");
  expect((await getWritingGuideAction(bookId, sectionId, "brief")).ok).toBe(false);
  expect(m.createMaster).not.toHaveBeenCalled();
});
it("vincula la guía al capítulo real y añade una revisión sin actualizar el manuscrito", async () => {
  expect((await saveWritingBriefAction({ status: "idle" }, form(true))).status).toBe("success");
  expect(m.createChapter).toHaveBeenCalledWith({
    data: expect.objectContaining({
      sectionId,
      version: 1,
      status: "APPROVED",
      content: expect.objectContaining({ title: "El regreso", sourceVersion: 3, masterVersion: 1 }),
    }),
  });
  expect(m.audit).toHaveBeenCalledOnce();
});
it("crea otra revisión maestra sin reemplazar la aprobada anterior", async () => {
  expect((await saveWritingBriefAction({ status: "idle" }, form())).status).toBe("success");
  expect(m.createMaster).toHaveBeenCalledWith({
    data: expect.objectContaining({ bookId, version: 2 }),
  });
});
it.each<Record<string, string>>([{ version: "0" }, { sourceKey: "b".repeat(64) }])(
  "rechaza un formulario obsoleto: %j",
  async (overrides) => {
    expect((await saveWritingBriefAction({ status: "idle" }, form(false, overrides))).status).toBe(
      "error",
    );
    expect(m.createMaster).not.toHaveBeenCalled();
  },
);
it("rechaza un capítulo o personaje de otro libro", async () => {
  expect(
    (await saveWritingBriefAction({ status: "idle" }, form(true, { sectionId: bookId }))).status,
  ).toBe("error");
  const fd = form(true);
  fd.append("characterIds", bookId);
  expect((await saveWritingBriefAction({ status: "idle" }, fd)).status).toBe("error");
  expect(m.createChapter).not.toHaveBeenCalled();
});
it("no asocia un resumen a una versión del manuscrito que cambió durante el guardado", async () => {
  m.rows.mockResolvedValue([{ id: sectionId, title: "El regreso", type: "CHAPTER", version: 4 }]);
  expect((await saveWritingBriefAction({ status: "idle" }, form(true))).status).toBe("error");
  expect(m.createChapter).not.toHaveBeenCalled();
});
it("un conflicto de unicidad concurrente devuelve error y no confirma éxito", async () => {
  m.createMaster.mockRejectedValueOnce({ code: "P2002" });
  expect((await saveWritingBriefAction({ status: "idle" }, form())).status).toBe("error");
  expect(m.audit).not.toHaveBeenCalled();
});
it("la copia también comprueba el origen antes de acceder a datos", async () => {
  m.origin.mockRejectedValueOnce(new Error("Origen inválido"));
  expect((await getWritingGuideAction(bookId, sectionId, "brief")).ok).toBe(false);
  expect(m.load).not.toHaveBeenCalled();
});
