import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  role: "OWNER",
  origin: vi.fn(),
  edition: vi.fn(),
  update: vi.fn(),
  rows: vi.fn(),
  create: vi.fn(),
  section: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ user: { id: "u" }, workspace: { id: "w", role: m.role } }),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditLog: m.audit }));
vi.mock("@/lib/security/request-context", () => ({ assertServerActionOrigin: m.origin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        bookEdition: { findFirst: m.edition, update: m.update },
        editorialMatter: { findMany: m.rows, create: m.create },
        bookSection: { findFirst: m.section },
      }),
  },
}));
import { updateLegalTemplateAction } from "./template-actions";
const bookId = "11111111-1111-4111-8111-111111111111";
function form(mode = "TEMPLATE") {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    bookId,
    template: "copyright-minimal",
    mode,
    sectionId: "",
    customClauses: "Texto propio",
    license: "",
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.role = "OWNER";
  m.origin.mockResolvedValue({});
  m.edition.mockResolvedValue({ id: "edition", settings: { unrelated: true } });
  m.rows.mockResolvedValue([]);
  m.section.mockResolvedValue(null);
});
it("guarda settings sin perder otras claves y registra versión por edición", async () => {
  expect((await updateLegalTemplateAction({ status: "idle" }, form())).status).toBe("success");
  expect(m.edition.mock.calls[0]?.[0].where.book.workspaceId).toBe("w");
  expect(m.update.mock.calls[0]?.[0].data.settings).toMatchObject({
    unrelated: true,
    legalPageTemplate: "copyright-minimal",
    legalPageTemplateVersion: 1,
  });
  expect(m.create.mock.calls[0]?.[0].data).toMatchObject({
    bookId,
    kind: "COPYRIGHT",
    templateSlug: "copyright-minimal",
    data: { editionId: "edition" },
  });
  expect(m.audit).toHaveBeenCalled();
});
it("el modo desactivado no borra secciones y el manual exige una sección propia", async () => {
  expect((await updateLegalTemplateAction({ status: "idle" }, form("DISABLED"))).status).toBe(
    "success",
  );
  const f = form("MANUAL");
  f.set("sectionId", bookId);
  expect((await updateLegalTemplateAction({ status: "idle" }, f)).status).toBe("error");
});
it("rechaza origen, rol, libro ajeno y cláusulas inválidas", async () => {
  m.role = "REVIEWER";
  expect((await updateLegalTemplateAction({ status: "idle" }, form())).status).toBe("error");
  expect(m.update).not.toHaveBeenCalled();
  m.role = "OWNER";
  m.edition.mockResolvedValue(null);
  expect((await updateLegalTemplateAction({ status: "idle" }, form())).status).toBe("error");
  const f = form();
  f.set("customClauses", "\u0007");
  expect((await updateLegalTemplateAction({ status: "idle" }, f)).status).toBe("error");
  m.origin.mockRejectedValue(new Error());
  expect((await updateLegalTemplateAction({ status: "idle" }, form())).status).toBe("error");
});

it("persiste el diseño del índice y las columnas de profundidad con alcance de workspace", async () => {
  const { updateTocTemplateAction } = await import("./template-actions");
  const { TOC_TEMPLATE_CATALOG } = await import("@escribiendo/templates");
  const f = new FormData();
  f.set("bookId", bookId);
  f.set("parameters", JSON.stringify(TOC_TEMPLATE_CATALOG[1]!.parameters));
  expect((await updateTocTemplateAction({ status: "idle" }, f)).status).toBe("success");
  expect(m.update.mock.calls[0]?.[0].data).toMatchObject({
    tocDepth: "chapters-h1-h2-h3",
    settings: { unrelated: true, tocTemplate: "toc-detailed", tocTemplateVersion: 2 },
  });
  expect(m.create.mock.calls[0]?.[0].data).toMatchObject({
    kind: "TABLE_OF_CONTENTS",
    mode: "AUTOMATIC",
    templateSlug: "toc-detailed",
    templateVersion: 2,
  });
  m.role = "REVIEWER";
  expect((await updateTocTemplateAction({ status: "idle" }, f)).status).toBe("error");
});
