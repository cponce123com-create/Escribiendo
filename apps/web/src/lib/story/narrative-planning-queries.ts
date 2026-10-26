import "server-only";
import type { SessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { editorialOrder } from "@/lib/books/reading-order";
export async function loadNarrativePlanning(session: SessionContext, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, narrativeStructure: true, narrativeVersion: true },
  });
  if (!book) return null;
  const [sections, characters, events] = await Promise.all([
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      select: {
        id: true,
        title: true,
        type: true,
        parentId: true,
        sortOrder: true,
        narrativeStage: true,
      },
    }),
    prisma.storyCharacter.findMany({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.storyCharacterEvent.findMany({
      where: { bookId, workspaceId: session.workspace.id, character: { deletedAt: null } },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 1001,
      select: {
        id: true,
        title: true,
        details: true,
        characterId: true,
        sectionId: true,
        sequence: true,
        startsOn: true,
        endsOn: true,
        datePrecision: true,
        suggested: true,
      },
    }),
  ]);
  return {
    book,
    sections: editorialOrder(sections, false),
    characters,
    events: events.slice(0, 1000),
    truncated: events.length > 1000,
  };
}
export type NarrativePlanningData = NonNullable<Awaited<ReturnType<typeof loadNarrativePlanning>>>;
