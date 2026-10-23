import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TYPOGRAPHY_STYLE } from "@escribiendo/editorial-engine";
import type { SessionContext } from "@/lib/auth/session";

const { mockPrisma, mockBookToBlocks, mockGetBookCover, mockGetBookEdition, mockOutlineFromPages } =
  vi.hoisted(() => ({
    mockPrisma: {
      bookSection: { findMany: vi.fn() },
      book: { findFirst: vi.fn() },
    },
    mockBookToBlocks: vi.fn(),
    mockGetBookCover: vi.fn(),
    mockGetBookEdition: vi.fn(),
    mockOutlineFromPages: vi.fn(),
  }));

// Estas pruebas aíslan composición/reproducción de las materias automáticas.
vi.mock("@/lib/editorial/book-matter", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadBookMatter: async () => null,
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
      frontMatter: [],
      backMatter: [],
    });
  });

  it("no activa la inicial por defecto", async () => {
    const preview = await buildPreview(session, "book-1");

    expect(preview?.dropCaps).toBe(false);
    expect(mockBookToBlocks).toHaveBeenCalledWith(expect.any(Array), {
      dropCaps: false,
      frontMatter: [],
      backMatter: [],
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

  it("ordena las secciones con el mismo desempate que la exportación", async () => {
    await buildPreview(session, "book-1");

    expect(mockPrisma.bookSection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }],
      }),
    );
  });
});
