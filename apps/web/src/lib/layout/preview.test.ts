import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TYPOGRAPHY_STYLE } from "@escribiendo/editorial-engine";
import type { SessionContext } from "@/lib/auth/session";

const {
  mockPrisma,
  mockBookToBlocks,
  mockGetBookCover,
  mockGetBookEdition,
  mockOutlineFromPages,
  mockLoadBookMatter,
} = vi.hoisted(() => ({
  mockPrisma: {
    bookSection: { findMany: vi.fn() },
    book: { findFirst: vi.fn() },
  },
  mockBookToBlocks: vi.fn(),
  mockGetBookCover: vi.fn(),
  mockGetBookEdition: vi.fn(),
  mockOutlineFromPages: vi.fn(),
  mockLoadBookMatter: vi.fn(),
}));

// Estas pruebas aíslan composición/reproducción de las materias automáticas.
vi.mock("@/lib/editorial/book-matter", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadBookMatter: mockLoadBookMatter,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("./profiles", () => ({
  getBookEdition: mockGetBookEdition,
  getDefaultLayoutProfile: vi.fn(),
}));
vi.mock("./blocks", () => ({
  bookToBlocks: mockBookToBlocks,
  isChapterType: () => true,
  seccionesExportables: (sections: unknown[]) => sections,
}));
vi.mock("@/lib/export/fonts", () => ({ loadPdfFonts: async () => null }));
vi.mock("@/lib/export/pdf-pages", () => ({ outlineFromPages: mockOutlineFromPages }));
vi.mock("@/lib/books/covers", () => ({ getBookCover: mockGetBookCover }));

import { buildPreview } from "./preview";

const session = {
  sessionId: "session-1",
  user: { id: "user-1", email: "user@example.com", name: "User", role: "AUTHOR" },
  workspace: { id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" },
  workspaces: [{ id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" }],
} as unknown as SessionContext;

const profile = {
  id: "profile-1",
  name: "A5",
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 18,
  gutterMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 12,
  mirrorMargins: true,
  chapterStartsRecto: false,
  showPageNumbers: true,
  typography: {},
};

const bloque = {
  id: "b1",
  kind: "body" as const,
  text: "Hola mundo",
  style: DEFAULT_TYPOGRAPHY_STYLE,
  sectionId: "s1",
  firstOfSection: true,
};

describe("vista previa paginada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadBookMatter.mockResolvedValue(null);
    mockGetBookEdition.mockResolvedValue({ profile, template: null });
    mockBookToBlocks.mockReturnValue([bloque]);
    mockOutlineFromPages.mockReturnValue([{ title: "Capítulo", pageIndex: 0 }]);
    mockGetBookCover.mockResolvedValue(null);
    mockPrisma.book.findFirst.mockResolvedValue({ title: "Libro" });
    mockPrisma.bookSection.findMany.mockResolvedValue([
      {
        id: "s1",
        title: "Capítulo",
        type: "CHAPTER",
        content: {},
        parentId: null,
        startOnOddPage: false,
        pageBreakBefore: false,
        includeInExport: true,
        showInToc: true,
        showTitle: true,
        showSectionType: false,
        showSectionNumber: false,
      },
    ]);
  });

  it("compone con la inicial capitular cuando se pide", async () => {
    const preview = await buildPreview(session, "book-1", { dropCaps: true });

    expect(preview?.dropCaps).toBe(true);
    expect(mockBookToBlocks).toHaveBeenCalledWith(expect.any(Array), {
      dropCaps: true,
      dropCapLines: 3,
      frontMatter: [],
      backMatter: [],
      contentHeightMm: 170,
    });
  });

  it("no activa la inicial por defecto", async () => {
    const preview = await buildPreview(session, "book-1");

    expect(preview?.dropCaps).toBe(false);
    expect(mockBookToBlocks).toHaveBeenCalledWith(expect.any(Array), {
      dropCaps: false,
      dropCapLines: 3,
      frontMatter: [],
      backMatter: [],
      contentHeightMm: 170,
    });
  });

  it("usa la inicial persistida en la edición", async () => {
    mockLoadBookMatter.mockResolvedValue({
      tocMode: "AUTOMATIC",
      tocSources: [],
      tocOptions: {
        depth: "chapters-h1",
        includeFrontMatter: true,
        includeBackMatter: true,
        skipEmptyTitles: true,
      },
      legal: null,
      dropCap: { enabled: true, lines: 2 },
      legalMode: "print",
      hasTocSection: false,
      hasCopyrightSection: false,
    });

    const preview = await buildPreview(session, "book-1");

    expect(preview?.dropCaps).toBe(true);
    expect(preview?.dropCapLines).toBe(2);
    expect(mockBookToBlocks).toHaveBeenCalledWith(expect.any(Array), {
      dropCaps: true,
      dropCapLines: 2,
      frontMatter: [],
      backMatter: [],
      contentHeightMm: 170,
    });
  });

  it("desplaza el índice cuando la portada ocupa la primera página", async () => {
    const crop = { x: 10, y: 20, zoom: 1.5 };
    mockGetBookCover.mockResolvedValue({ url: "https://cdn.example.com/portada.jpg", crop });

    const preview = await buildPreview(session, "book-1");

    expect(preview?.cover).toEqual({
      url: "https://cdn.example.com/portada.jpg",
      alt: "Portada de Libro",
      crop,
    });
    expect(preview?.outline).toEqual([{ title: "Capítulo", pageIndex: 1 }]);
  });

  it("no desplaza el índice si el libro no tiene portada", async () => {
    const preview = await buildPreview(session, "book-1");

    expect(preview?.cover).toBeNull();
    expect(preview?.outline).toEqual([{ title: "Capítulo", pageIndex: 0 }]);
  });

  it("coloca el prólogo delante del cuerpo aunque su sortOrder sea mayor", async () => {
    mockPrisma.bookSection.findMany.mockResolvedValue([
      { id: "chapter", title: "Capítulo", type: "CHAPTER", sortOrder: 0, includeInExport: true },
      { id: "prologue", title: "Prólogo", type: "PROLOGUE", sortOrder: 999, includeInExport: true },
    ]);
    await buildPreview(session, "book-1");
    expect(mockBookToBlocks.mock.calls[0]?.[0].map((row: { id: string }) => row.id)).toEqual([
      "prologue",
      "chapter",
    ]);
  });

  it("ordena las secciones con el mismo desempate que la exportación", async () => {
    await buildPreview(session, "book-1");

    expect(mockPrisma.bookSection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
      }),
    );
  });
});
