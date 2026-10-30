import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  start: vi.fn(),
  claim: vi.fn(),
  rows: vi.fn(),
  sections: vi.fn(),
  create: vi.fn(),
  bulk: vi.fn(),
  update: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  raw: vi.fn(),
  asset: vi.fn(),
  audit: vi.fn(),
  totals: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../action-helpers", () => ({ beginStoryAction: m.start }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: m.audit }));
vi.mock("@/lib/books/statistics", () => ({ recomputeBookTotals: m.totals }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        book: { updateMany: m.claim },
        storyPlanItem: {
          findMany: m.rows,
          create: m.create,
          createMany: m.bulk,
          updateMany: m.update,
        },
        bookSection: { findMany: m.sections, create: m.createSection, updateMany: m.updateSection },
        $executeRaw: m.raw,
        bookAsset: { findFirst: m.asset },
      }),
  },
}));
import { modularPlanAction } from "./actions";
import { manuscriptKey } from "./queries";
const bookId = "11111111-1111-4111-8111-111111111111",
  partId = "22222222-2222-4222-8222-222222222222",
  chapterId = "33333333-3333-4333-8333-333333333333",
  sectionId = "44444444-4444-4444-8444-444444444444";
function card(id = partId, kind = "ACT", parentId: string | null = null) {
  return {
    id,
    kind,
    parentId,
    bookId,
    workspaceId: "w",
    title: kind === "ACT" ? "Parte uno" : "Capítulo uno",
    status: "IDEA",
    sortOrder: 0,
    version: 1,
    sectionId: null,
    summary: null,
    goal: null,
    conflict: null,
    outcome: null,
    targetWords: null,
    createdAt: new Date("2026-01-01Z"),
  };
}
function form(operation: string, extra: Record<string, string> = {}) {
  const f = new FormData();
  Object.entries({
    operation,
    bookId,
    version: "0",
    sourceKey: manuscriptKey([]),
    ...extra,
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.start.mockResolvedValue({
    ok: true,
    session: { user: { id: "u" }, workspace: { id: "w", role: "OWNER" } },
    context: {},
  });
  m.claim.mockResolvedValue({ count: 1 });
  m.rows.mockResolvedValue([]);
  m.sections.mockResolvedValue([]);
  m.raw.mockResolvedValue(1);
  m.update.mockResolvedValue({ count: 1 });
  m.create.mockImplementation(async ({ data }) => ({
    ...card(data.id, data.kind, data.parentId),
    ...data,
  }));
});
it("no lee ni escribe cuando el origen o permiso fueron rechazados", async () => {
  m.start.mockResolvedValue({ ok: false, state: { status: "error", message: "Sin permiso" } });
  expect((await modularPlanAction({ status: "idle" }, form("save"))).status).toBe("error");
  expect(m.claim).not.toHaveBeenCalled();
});
it("exige libro, espacio y versión antes de tocar tarjetas", async () => {
  m.claim.mockResolvedValue({ count: 0 });
  expect(
    (await modularPlanAction({ status: "idle" }, form("move", { id: chapterId }))).status,
  ).toBe("error");
  expect(m.claim).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: bookId, workspaceId: "w", deletedAt: null, narrativeVersion: 0 },
    }),
  );
  expect(m.rows).not.toHaveBeenCalled();
});
it("crea un capítulo dentro de una parte del mismo libro", async () => {
  m.rows.mockResolvedValue([card()]);
  expect(
    (
      await modularPlanAction(
        { status: "idle" },
        form("save", {
          kind: "CHAPTER",
          title: "El regreso",
          parentId: partId,
          goal: "Presentar el conflicto",
        }),
      )
    ).status,
  ).toBe("success");
  expect(m.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      bookId,
      workspaceId: "w",
      parentId: partId,
      title: "El regreso",
      goal: "Presentar el conflicto",
    }),
  });
});
it("rechaza contenedores o vínculos que no pertenecen al libro", async () => {
  expect(
    (
      await modularPlanAction(
        { status: "idle" },
        form("save", { title: "Nuevo", parentId: partId }),
      )
    ).status,
  ).toBe("error");
  expect(
    (await modularPlanAction({ status: "idle" }, form("save", { title: "Nuevo", sectionId })))
      .status,
  ).toBe("error");
  expect(m.create).not.toHaveBeenCalled();
});
it("un cambio del manuscrito invalida la confirmación de aplicar", async () => {
  expect(
    (await modularPlanAction({ status: "idle" }, form("apply", { sourceKey: "a".repeat(64) })))
      .status,
  ).toBe("error");
  expect(m.createSection).not.toHaveBeenCalled();
});
it("no archiva contenedores con hijos ni elimina texto del manuscrito", async () => {
  m.rows.mockResolvedValue([card(), card(chapterId, "CHAPTER", partId)]);
  expect((await modularPlanAction({ status: "idle" }, form("delete", { id: partId }))).status).toBe(
    "error",
  );
  expect(m.update).not.toHaveBeenCalled();
  expect(m.updateSection).not.toHaveBeenCalled();
});
it("archivar una hoja suelta el vínculo y conserva la sección", async () => {
  m.rows.mockResolvedValue([card(chapterId, "CHAPTER")]);
  expect(
    (await modularPlanAction({ status: "idle" }, form("delete", { id: chapterId }))).status,
  ).toBe("success");
  expect(m.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sectionId: null, deletedAt: expect.any(Date) }),
    }),
  );
  expect(m.updateSection).not.toHaveBeenCalled();
});
it("la reubicación utiliza parámetros SQL y no cambia el manuscrito", async () => {
  m.rows.mockResolvedValue([card(), card(chapterId, "CHAPTER", partId)]);
  expect(
    (await modularPlanAction({ status: "idle" }, form("move", { id: chapterId, parentId: "" })))
      .status,
  ).toBe("success");
  expect(m.raw).toHaveBeenCalledOnce();
  const sql = m.raw.mock.calls[0]![0];
  expect(sql.values).toContain(chapterId);
  expect(sql.values).toContain(bookId);
  expect(sql.sql).toContain('p."workspaceId"');
  expect(m.updateSection).not.toHaveBeenCalled();
});
it("importar otra vez las secciones vinculadas no duplica tarjetas", async () => {
  const section = {
    id: sectionId,
    title: "Parte uno",
    type: "PART",
    parentId: null,
    sortOrder: 0,
    version: 1,
  };
  m.sections.mockResolvedValue([section]);
  m.rows.mockResolvedValue([{ ...card(), sectionId }]);
  expect(
    (
      await modularPlanAction(
        { status: "idle" },
        form("import", { sourceKey: manuscriptKey([section]) }),
      )
    ).message,
  ).toContain("No se crearon duplicados");
  expect(m.create).not.toHaveBeenCalled();
});
it("aplicar conserva contenido y títulos de las secciones existentes", async () => {
  const section = {
    id: sectionId,
    title: "Capítulo uno",
    type: "CHAPTER",
    parentId: null,
    sortOrder: 4,
    version: 7,
  };
  m.sections.mockResolvedValue([section]);
  m.rows.mockResolvedValue([{ ...card(chapterId, "CHAPTER"), sectionId }]);
  expect(
    (
      await modularPlanAction(
        { status: "idle" },
        form("apply", { sourceKey: manuscriptKey([section]) }),
      )
    ).status,
  ).toBe("success");
  expect(m.updateSection).toHaveBeenCalledWith({
    where: { id: sectionId, bookId, deletedAt: null },
    data: { parentId: null, sortOrder: 0 },
  });
  expect(m.totals).toHaveBeenCalledOnce();
});
it("no aplica si hay capítulos reales sin vincular ni renombra títulos distintos", async () => {
  const section = {
    id: sectionId,
    title: "Título existente",
    type: "CHAPTER",
    parentId: null,
    sortOrder: 0,
    version: 1,
  };
  m.sections.mockResolvedValue([section]);
  m.rows.mockResolvedValue([card(chapterId, "CHAPTER")]);
  expect(
    (
      await modularPlanAction(
        { status: "idle" },
        form("apply", { sourceKey: manuscriptKey([section]) }),
      )
    ).message,
  ).toContain("sin vincular");
  m.rows.mockResolvedValue([{ ...card(chapterId, "CHAPTER"), sectionId }]);
  expect(
    (
      await modularPlanAction(
        { status: "idle" },
        form("apply", { sourceKey: manuscriptKey([section]) }),
      )
    ).message,
  ).toContain("difiere");
  expect(m.updateSection).not.toHaveBeenCalled();
});

it("crea cinco partes y treinta capítulos sin argumentos ni personajes inventados", async () => {
  m.bulk.mockResolvedValue({ count: 35 });
  const result = await modularPlanAction(
    { status: "idle" },
    form("template", { template: "FIVE_PARTS", chapterCount: "30" }),
  );
  expect(result.status).toBe("success");
  const rows = m.bulk.mock.calls[0]![0].data;
  expect(rows.filter((r: { kind: string }) => r.kind === "ACT")).toHaveLength(5);
  expect(rows.filter((r: { kind: string }) => r.kind === "CHAPTER")).toHaveLength(30);
  expect(rows.every((r: Record<string, unknown>) => !("summary" in r))).toBe(true);
  expect(
    rows
      .filter((r: { kind: string }) => r.kind === "CHAPTER")
      .map((r: { title: string }) => r.title),
  ).toEqual(Array.from({ length: 30 }, (_, i) => `Capítulo ${i + 1}`));
  expect(m.createSection).not.toHaveBeenCalled();
});
it("no reemplaza tarjetas existentes al pedir un esquema inicial", async () => {
  m.rows.mockResolvedValue([card()]);
  expect((await modularPlanAction({ status: "idle" }, form("template"))).status).toBe("error");
  expect(m.bulk).not.toHaveBeenCalled();
});

it("rechaza una imagen de otro libro y valida la biblioteca por workspace", async () => {
  m.asset.mockResolvedValue(null);
  const result = await modularPlanAction(
    { status: "idle" },
    form("save", { title: "Parte visual", kind: "ACT", imageAssetId: sectionId }),
  );
  expect(result.status).toBe("error");
  expect(result.message).toContain("biblioteca de este libro");
  expect(m.asset.mock.calls[0]?.[0].where).toMatchObject({
    bookId,
    assetId: sectionId,
    book: { workspaceId: "w" },
    asset: { workspaceId: "w", deletedAt: null },
  });
  expect(m.create).not.toHaveBeenCalled();
});
it("guarda etiquetas y una imagen comprobada sin inferir datos", async () => {
  m.asset.mockResolvedValue({ assetId: sectionId });
  const result = await modularPlanAction(
    { status: "idle" },
    form("save", {
      title: "Parte visual",
      kind: "ACT",
      labels: "Duelo, Inicio, duelo",
      imageAssetId: sectionId,
      tone: "blue",
    }),
  );
  expect(result.status).toBe("success");
  expect(m.create.mock.calls[0]?.[0].data.visual).toEqual({
    version: 1,
    labels: ["Duelo", "Inicio"],
    imageAssetId: sectionId,
    tone: "blue",
  });
});
