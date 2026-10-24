import { beforeEach, expect, it, vi } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
const mocks = vi.hoisted(() => ({
  book: vi.fn(),
  sections: vi.fn(),
  characters: vi.fn(),
  relations: vi.fn(),
  events: vi.fn(),
  planning: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    book: { findFirst: mocks.book },
    bookSection: { findMany: mocks.sections },
    storyCharacter: { findMany: mocks.characters },
    storyCharacterRelation: { findMany: mocks.relations },
    storyCharacterEvent: { findMany: mocks.events },
    storyPlanItem: { findMany: mocks.planning },
  },
}));
import { getNarrativeDashboard } from "./narrative-queries";
const session = { workspace: { id: "workspace" } } as SessionContext;
const event = {
  id: "event",
  title: "Encuentro",
  details: null,
  sourceExcerpt: null,
  sectionId: "section",
  sequence: 4,
  suggested: false,
  character: { name: "Ana" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.book.mockResolvedValue({ id: "book", title: "Libro" });
  mocks.sections.mockResolvedValue([]);
  mocks.characters.mockResolvedValue([]);
  mocks.relations.mockResolvedValue([]);
  mocks.events.mockResolvedValue([]);
  mocks.planning.mockResolvedValue([]);
});
it("resuelve títulos de cronología por lote sin una relación section inexistente", async () => {
  mocks.events.mockResolvedValue([event, { ...event, id: "event-2" }]);
  mocks.sections
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: "section", title: "El viaje", sortOrder: 7 }]);
  const dashboard = await getNarrativeDashboard(session, "book");
  expect(mocks.events).toHaveBeenCalledWith(
    expect.objectContaining({ include: { character: { select: { name: true } } } }),
  );
  expect(mocks.sections).toHaveBeenNthCalledWith(2, {
    where: {
      id: { in: ["section"] },
      bookId: "book",
      deletedAt: null,
      book: { workspaceId: "workspace", deletedAt: null },
    },
    select: { id: true, title: true, sortOrder: true },
  });
  expect(dashboard?.timeline[0]).toMatchObject({
    sectionTitle: "El viaje",
    narrativeOrder: 7,
    chronologicalOrder: 4,
    characterName: "Ana",
  });
  expect(dashboard?.timeline).toHaveLength(2);
});
it("conserva eventos sin sección o con una sección ya eliminada", async () => {
  mocks.events.mockResolvedValue([event, { ...event, id: "unlinked", sectionId: null }]);
  const dashboard = await getNarrativeDashboard(session, "book");
  expect(dashboard?.timeline).toHaveLength(2);
  for (const entry of dashboard!.timeline)
    expect(entry).toMatchObject({ sectionTitle: null, narrativeOrder: 0, characterName: "Ana" });
});
it("no consulta referencias si no hay eventos enlazados y rechaza libros ajenos", async () => {
  await getNarrativeDashboard(session, "book");
  expect(mocks.sections).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  mocks.book.mockResolvedValue(null);
  expect(await getNarrativeDashboard(session, "foreign")).toBeNull();
  expect(mocks.events).not.toHaveBeenCalled();
  expect(mocks.book).toHaveBeenCalledWith({
    where: { id: "foreign", workspaceId: "workspace", deletedAt: null },
    select: { id: true, title: true },
  });
});

it("carga las expresiones Unicode y analiza diálogos con comillas", async () => {
  mocks.sections.mockResolvedValue([
    {
      id: "section",
      title: "Capítulo",
      sortOrder: 1,
      wordCount: 5,
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: '"Hola mundo"' }] },
          { type: "paragraph", content: [{ type: "text", text: "«Buenos días»" }] },
          { type: "paragraph", content: [{ type: "text", text: "—Hasta mañana" }] },
        ],
      },
    },
  ]);
  const dashboard = await getNarrativeDashboard(session, "book");
  expect(dashboard?.interventions).toHaveLength(3);
  expect(dashboard?.chapters[0]?.dialogueWords).toBeGreaterThan(0);
});
it("trata los metacaracteres de los nombres como texto literal", async () => {
  mocks.characters.mockResolvedValue([{ id: "ana", name: "Ana (Luz)", role: "MAIN", notes: null }]);
  mocks.sections.mockResolvedValue([
    {
      id: "section",
      title: "Capítulo",
      sortOrder: 1,
      wordCount: 9,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Ana (Luz) saludó a Ana (Luz). Anabel siguió caminando." },
            ],
          },
        ],
      },
    },
  ]);
  const dashboard = await getNarrativeDashboard(session, "book");
  expect(dashboard?.characters[0]?.appearances).toBe(2);
});

it("no cuenta un nombre dentro de otra palabra", async () => {
  mocks.characters.mockResolvedValue([{ id: "ana", name: "Ana", role: "MAIN", notes: null }]);
  mocks.sections.mockResolvedValue([
    {
      id: "section",
      title: "Capítulo",
      sortOrder: 1,
      wordCount: 6,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Anabel vio a Ana. Mariana saludó a Ana." }],
          },
        ],
      },
    },
  ]);
  const dashboard = await getNarrativeDashboard(session, "book");
  expect(dashboard?.characters[0]?.appearances).toBe(2);
});
