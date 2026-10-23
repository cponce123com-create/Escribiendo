import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";
import type { ExportSection, SectionSnapshot } from "./manuscript";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    bookSection: { findMany: vi.fn() },
    sectionRevision: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  loadManuscriptForJob,
  loadManuscriptFromSnapshot,
  manuscriptHash,
  readSectionSnapshot,
} from "./manuscript";

const session = {
  sessionId: "session-1",
  user: { id: "user-1", email: "user@example.com", name: "User", role: "AUTHOR" },
  workspace: { id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" },
  workspaces: [{ id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" }],
} as unknown as SessionContext;

function section(overrides: Partial<ExportSection> = {}): ExportSection {
  return {
    id: "s1",
    title: "Capítulo",
    type: "CHAPTER",
    content: { type: "doc", content: [] },
    version: 1,
    startOnOddPage: false,
    pageBreakBefore: false,
    includeInExport: true,
    showInToc: true,
    showTitle: true,
    showSectionType: false,
    showSectionNumber: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<SectionSnapshot> = {}): SectionSnapshot {
  return {
    id: "s1",
    title: "Capítulo",
    type: "CHAPTER",
    version: 1,
    startOnOddPage: false,
    pageBreakBefore: false,
    includeInExport: true,
    showInToc: true,
    showTitle: true,
    showSectionType: false,
    showSectionNumber: false,
    ...overrides,
  };
}

describe("manuscrito de exportación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.bookSection.findMany.mockResolvedValue([]);
    mockPrisma.sectionRevision.findMany.mockResolvedValue([]);
  });

  describe("manuscriptHash", () => {
    it("es estable con el mismo manuscrito y la misma maqueta", () => {
      const first = manuscriptHash([section()], "PDF:maqueta");
      const second = manuscriptHash([section()], "PDF:maqueta");

      expect(first).toBe(second);
    });

    it("cambia al renombrar una sección", () => {
      const base = manuscriptHash([section()], "PDF:maqueta");

      expect(manuscriptHash([section({ title: "Otro título" })], "PDF:maqueta")).not.toBe(base);
    });

    it("cambia al modificar el tipo o las opciones de composición", () => {
      const base = manuscriptHash([section()], "PDF:maqueta");

      expect(manuscriptHash([section({ type: "PART" })], "PDF:maqueta")).not.toBe(base);
      expect(manuscriptHash([section({ showInToc: false })], "PDF:maqueta")).not.toBe(base);
      expect(manuscriptHash([section({ startOnOddPage: true })], "PDF:maqueta")).not.toBe(base);
    });

    it("cambia al reordenar las secciones", () => {
      const a = section({ id: "a", title: "A" });
      const b = section({ id: "b", title: "B" });

      expect(manuscriptHash([a, b], "PDF:maqueta")).not.toBe(manuscriptHash([b, a], "PDF:maqueta"));
    });

    it("cambia al cambiar la maqueta o la portada", () => {
      const sections = [section()];

      expect(manuscriptHash(sections, "PDF:maqueta")).not.toBe(
        manuscriptHash(sections, "PDF:maqueta-portada"),
      );
    });
  });

  describe("readSectionSnapshot", () => {
    it("recupera una instantánea completa", () => {
      expect(readSectionSnapshot([snapshot()])).toEqual([snapshot()]);
    });

    it("devuelve null para los trabajos antiguos que solo guardaban versiones", () => {
      expect(readSectionSnapshot([{ id: "s1", version: 1 }])).toBeNull();
      expect(readSectionSnapshot([])).toEqual([]);
      expect(readSectionSnapshot(null)).toBeNull();
    });

    it("devuelve null si falta una opción editorial", () => {
      const incomplete = { ...snapshot() } as Record<string, unknown>;
      delete incomplete.showInToc;

      expect(readSectionSnapshot([incomplete])).toBeNull();
    });
  });

  describe("loadManuscriptFromSnapshot", () => {
    it("usa los metadatos de la instantánea y recupera el contenido de la versión pedida", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([
        { id: "s1", version: 3, content: { actual: true } },
        { id: "s2", version: 1, content: { vigente: true } },
      ]);
      mockPrisma.sectionRevision.findMany.mockResolvedValue([
        { sectionId: "s1", version: 2, content: { antiguo: true } },
      ]);

      const sections = await loadManuscriptFromSnapshot(session, "book-1", [
        snapshot({ id: "s1", version: 2, title: "Título congelado" }),
        snapshot({ id: "s2", version: 1, title: "Segundo" }),
      ]);

      expect(sections).toHaveLength(2);
      expect(sections[0]?.title).toBe("Título congelado");
      expect(sections[0]?.content).toEqual({ antiguo: true });
      expect(sections[1]?.content).toEqual({ vigente: true });
    });

    it("incluye secciones borradas después de pedir el trabajo", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([
        { id: "s1", version: 1, content: { texto: "hola" } },
      ]);

      const sections = await loadManuscriptFromSnapshot(session, "book-1", [snapshot()]);

      expect(sections).toHaveLength(1);
      const query = mockPrisma.bookSection.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(query.where.deletedAt).toBeUndefined();
    });

    it("falla si la sección ya no existe", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([]);

      await expect(loadManuscriptFromSnapshot(session, "book-1", [snapshot()])).rejects.toThrow(
        "ya no existe",
      );
    });

    it("falla si no se encuentra la revisión pedida", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([
        { id: "s1", version: 3, content: { actual: true } },
      ]);

      await expect(
        loadManuscriptFromSnapshot(session, "book-1", [snapshot({ version: 2 })]),
      ).rejects.toThrow("No se ha podido recuperar");
    });
  });

  describe("loadManuscriptForJob", () => {
    it("usa la instantánea completa cuando existe", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([{ id: "s1", version: 1, content: {} }]);

      const sections = await loadManuscriptForJob(session, "book-1", [snapshot()]);

      expect(sections[0]?.title).toBe("Capítulo");
    });

    it("reconstruye los trabajos antiguos con las versiones guardadas", async () => {
      mockPrisma.bookSection.findMany.mockResolvedValue([
        {
          id: "s1",
          version: 1,
          title: "Actual",
          type: "CHAPTER",
          content: {},
          startOnOddPage: false,
          pageBreakBefore: false,
          includeInExport: true,
          showInToc: true,
          showTitle: true,
          showSectionType: false,
          showSectionNumber: false,
        },
      ]);

      const sections = await loadManuscriptForJob(session, "book-1", [{ id: "s1", version: 1 }]);

      expect(sections[0]?.title).toBe("Actual");
    });
  });
});

describe("immutable self-contained snapshots", () => {
  it("keeps an explicitly empty book empty without reading current sections", async () => {
    mockPrisma.bookSection.findMany.mockClear();
    expect(await loadManuscriptForJob(session, "book-1", [])).toEqual([]);
    expect(mockPrisma.bookSection.findMany).not.toHaveBeenCalled();
  });

  it("reproduces version one after the live section has changed or disappeared", async () => {
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }],
    };
    mockPrisma.bookSection.findMany.mockClear();
    const result = await loadManuscriptForJob(session, "book-1", [
      snapshot({ content, parentId: "part" }),
    ]);
    expect(result[0]?.content).toEqual(content);
    expect(result[0]?.parentId).toBe("part");
    expect(mockPrisma.bookSection.findMany).not.toHaveBeenCalled();
  });

  it("refuses corrupt snapshots instead of silently exporting today's manuscript", async () => {
    await expect(
      loadManuscriptForJob(session, "book-1", [{ id: "s1", version: 1, title: "Partial" }]),
    ).rejects.toThrow(/corrupta/);
    await expect(loadManuscriptForJob(session, "book-1", null)).rejects.toThrow(/corrupta/);
  });
});

it("refuses to silently drop missing legacy sections", async () => {
  mockPrisma.bookSection.findMany.mockResolvedValue([]);
  await expect(
    loadManuscriptForJob(session, "book-1", [{ id: "missing", version: 1 }]),
  ).rejects.toThrow(/archivo parcial/);
});
