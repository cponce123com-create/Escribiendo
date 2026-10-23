import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

const { mockPrisma, mockGetBookCover, mockExportContext, mockLoadManuscriptForJob } = vi.hoisted(
  () => ({
    mockPrisma: { book: { findFirst: vi.fn() } },
    mockGetBookCover: vi.fn(),
    mockExportContext: vi.fn(),
    mockLoadManuscriptForJob: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/books/covers", () => ({ getBookCover: mockGetBookCover }));
vi.mock("./generate", () => ({ exportContext: mockExportContext }));
vi.mock("./manuscript", () => ({ loadManuscriptForJob: mockLoadManuscriptForJob }));

import { resolveExportJobInput } from "./reproduce";

const session = {
  sessionId: "session-1",
  user: { id: "user-1", email: "user@example.com", name: "User", role: "AUTHOR" },
  workspace: { id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" },
  workspaces: [{ id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" }],
} as unknown as SessionContext;

const createdAt = new Date("2026-01-02T03:04:05.000Z");

const sections = [
  {
    id: "s1",
    title: "Capítulo",
    type: "CHAPTER",
    content: {},
    version: 1,
    startOnOddPage: false,
    pageBreakBefore: false,
    includeInExport: true,
    showInToc: true,
    showTitle: true,
    showSectionType: false,
    showSectionNumber: false,
  },
];

function job(options: unknown = {}) {
  return {
    bookId: "book-1",
    format: "PDF_DIGITAL" as const,
    sectionVersions: [{ id: "s1", version: 1 }],
    options,
    createdAt,
  };
}

function layout(overrides: Record<string, unknown> = {}) {
  return {
    layout: {
      profile: null,
      typography: { body: "congelada" },
      runningHeadTemplate: { runningHead: { recto: "R", verso: "V" } },
      bookTitle: "Título congelado",
      authorName: "Autor congelado",
      dropCaps: true,
      cover: {
        url: "https://cdn.example.com/congelada.jpg",
        crop: { x: 10, y: 20, zoom: 1.5 },
      },
      ...overrides,
    },
  };
}

describe("reproducción de exportaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.book.findFirst.mockResolvedValue({
      id: "book-1",
      title: "Título actual",
      authorName: "Autor actual",
    });
    mockLoadManuscriptForJob.mockResolvedValue(sections);
    mockGetBookCover.mockResolvedValue({
      url: "https://cdn.example.com/actual.jpg",
      crop: { x: 50, y: 50, zoom: 1 },
    });
    mockExportContext.mockResolvedValue({
      title: "Edición",
      author: "ESCRIBIENDO",
      profile: null,
      typography: { body: "actual" },
      runningHeadTemplate: null,
    });
  });

  it("usa la instantánea sin releer la portada ni la maqueta actuales", async () => {
    const input = await resolveExportJobInput(session, job(layout()));

    expect(input.title).toBe("Título congelado");
    expect(input.author).toBe("Autor congelado");
    expect(input.bookTitle).toBe("Título congelado");
    expect(input.dropCaps).toBe(true);
    expect(input.typography).toEqual({ body: "congelada" });
    expect(input.runningHeadTemplate).toEqual({ runningHead: { recto: "R", verso: "V" } });
    expect(input.cover).toEqual({
      src: "https://cdn.example.com/congelada.jpg",
      alt: "Portada de Título congelado",
    });
    expect(input.createdAt).toBe(createdAt);
    expect(mockGetBookCover).not.toHaveBeenCalled();
    expect(mockExportContext).not.toHaveBeenCalled();
    expect(mockLoadManuscriptForJob).toHaveBeenCalledWith(session, "book-1", [
      { id: "s1", version: 1 },
    ]);
  });

  it("respeta que el libro no tenía portada al pedir el trabajo", async () => {
    const input = await resolveExportJobInput(session, job(layout({ cover: null })));

    expect(input.cover).toBeUndefined();
    expect(mockGetBookCover).not.toHaveBeenCalled();
  });

  it("los trabajos antiguos usan los datos actuales", async () => {
    const input = await resolveExportJobInput(session, job());

    expect(input.title).toBe("Título actual");
    expect(input.author).toBe("Autor actual");
    expect(input.typography).toEqual({ body: "actual" });
    expect(input.cover).toEqual({
      src: "https://cdn.example.com/actual.jpg",
      alt: "Portada de Título actual",
    });
    expect(mockGetBookCover).toHaveBeenCalledWith(session, "book-1");
    expect(mockExportContext).toHaveBeenCalledWith(session, "book-1");
  });

  it("cae al título actual si la instantánea no lo capturó", async () => {
    const input = await resolveExportJobInput(session, job(layout({ bookTitle: "" })));

    expect(input.title).toBe("Título actual");
  });

  it("falla si el libro ya no existe", async () => {
    mockPrisma.book.findFirst.mockResolvedValue(null);

    await expect(resolveExportJobInput(session, job())).rejects.toThrow("no existe");
  });
});
