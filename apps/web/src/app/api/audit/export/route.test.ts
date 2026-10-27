import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { findMany: mocks.rows } } }));
import { GET } from "./route";
beforeEach(() => {
  mocks.session.mockResolvedValue({ workspace: { id: "w", name: "Estudio", role: "OWNER" } });
  mocks.rows.mockResolvedValue([
    {
      createdAt: new Date("2026-01-01Z"),
      action: "EDIT",
      entityType: "Book",
      entityId: "b",
      requestId: "r",
      actor: { name: "=nombre", email: "a@b.test" },
      metadata: { original: true },
    },
  ]);
});
it("conserva los datos JSON sin neutralización CSV", async () => {
  const response = await GET(new Request("https://example.test/api/audit/export?format=json"));
  const body = await response.json();
  expect(body.rows[0].actor.name).toBe("=nombre");
  expect(body.rows[0].metadata).toEqual({ original: true });
});
it("sirve el CSV generado con columnas alineadas", async () => {
  const response = await GET(new Request("https://example.test/api/audit/export"));
  const text = await response.text();
  expect(text).toContain("entidad_id,solicitud,persona,correo,detalle");
  expect(text).toContain("'" + "=nombre");
});
