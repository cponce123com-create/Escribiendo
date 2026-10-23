/** Read-only by default. --apply changes derived counters, never manuscript content. */
import { config } from "dotenv";
import { PrismaClient } from "../packages/database/src/index";
import { countWordsInDocument, parseTiptapDocument } from "../packages/book-schema/src/index";
import { recomputeBookTotals } from "../apps/web/src/lib/books/statistics";
config({ quiet: true });
const db = new PrismaClient();
const apply = process.argv.includes("--apply");
let cursor: string | undefined;
try {
  for (;;) {
    const books = await db.book.findMany({
      where: { deletedAt: null },
      orderBy: { id: "asc" },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        wordCount: true,
        chapterCount: true,
        writingProgress: true,
        targetWordCount: true,
      },
    });
    if (!books.length) break;
    for (const book of books) {
      const sections = await db.bookSection.findMany({
        where: { bookId: book.id, deletedAt: null },
        select: { id: true, version: true, type: true, content: true, wordCount: true },
      });
      // Invalid content aborts instead of silently setting its count to zero.
      const counts = sections.map((section) => ({
        ...section,
        computed: countWordsInDocument(parseTiptapDocument(section.content)),
      }));
      const words = counts.reduce((sum, section) => sum + section.computed, 0);
      const chapters = counts.filter((section) => section.type === "CHAPTER").length;
      const changed = counts.filter((section) => section.wordCount !== section.computed);
      console.log(
        JSON.stringify({
          bookId: book.id,
          mode: apply ? "apply" : "dry-run",
          before: { words: book.wordCount, chapters: book.chapterCount },
          after: { words, chapters },
          sectionCountersToReconcile: changed.length,
        }),
      );
      if (apply) {
        await db.$transaction(
          async (tx) => {
            for (const section of counts) {
              const result = await tx.bookSection.updateMany({
                where: {
                  id: section.id,
                  bookId: book.id,
                  version: section.version,
                  deletedAt: null,
                },
                data: { wordCount: section.computed },
              });
              if (result.count !== 1)
                throw new Error("Concurrent section change; this book was not reconciled.");
            }
            await recomputeBookTotals(tx, book.id);
          },
          { isolationLevel: "Serializable", timeout: 15_000 },
        );
      }
    }
    cursor = books.at(-1)?.id;
  }
} finally {
  await db.$disconnect();
}
