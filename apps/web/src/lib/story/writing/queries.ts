import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { editorialOrder } from "@/lib/books/reading-order";
import { chapterSnapshotSchema, masterSnapshotSchema, WritingGuideError } from "./brief";

export async function loadWritingPlanning(session: SessionContext, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: {
      id: true,
      title: true,
      authorName: true,
      genre: true,
      writingBriefs: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!book) return null;
  const [rows, characters, worlds] = await Promise.all([
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      take: 201,
      select: {
        id: true,
        title: true,
        type: true,
        parentId: true,
        sortOrder: true,
        version: true,
        writingBriefs: { orderBy: { version: "desc" }, take: 1 },
      },
    }),
    prisma.storyCharacter.findMany({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
      take: 201,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, aliases: true, summary: true },
    }),
    prisma.storyWorld.findMany({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
      take: 201,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, summary: true },
    }),
  ]);
  if (rows.length > 200 || characters.length > 200 || worlds.length > 200)
    throw new WritingGuideError(
      "Esta vista admite hasta 200 secciones, personajes y lugares por libro. No se ha cargado un plan incompleto.",
    );
  const masterRow = book.writingBriefs[0];
  const master = masterRow
    ? {
        version: masterRow.version,
        status: masterRow.status,
        content: masterSnapshotSchema.parse(masterRow.content),
      }
    : null;
  const sections = editorialOrder(rows, false).map(({ writingBriefs, ...section }) => {
    const row = writingBriefs[0];
    return {
      ...section,
      brief: row
        ? {
            version: row.version,
            status: row.status,
            content: chapterSnapshotSchema.parse(row.content),
          }
        : null,
    };
  });
  const sourceKey = createHash("sha256")
    .update(
      JSON.stringify({
        title: book.title,
        author: book.authorName,
        genre: book.genre,
        sections: sections.map(({ id, title }) => ({ id, title })),
        characters,
        worlds,
      }),
    )
    .digest("hex");
  return {
    book: { id: book.id, title: book.title, authorName: book.authorName, genre: book.genre },
    master,
    sections,
    characters,
    worlds,
    sourceKey,
  };
}
export type WritingPlanningData = NonNullable<Awaited<ReturnType<typeof loadWritingPlanning>>>;
