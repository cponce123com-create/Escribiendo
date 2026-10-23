import type { Prisma } from "@escribiendo/database";
import { computeWritingProgress } from "./progress";

export async function recomputeBookTotals(
  transaction: Prisma.TransactionClient,
  bookId: string,
): Promise<void> {
  const [aggregate, chapters, book] = await Promise.all([
    transaction.bookSection.aggregate({
      where: { bookId, deletedAt: null },
      _sum: { wordCount: true },
    }),
    transaction.bookSection.count({
      where: { bookId, deletedAt: null, type: "CHAPTER" },
    }),
    transaction.book.findUniqueOrThrow({
      where: { id: bookId },
      select: { targetWordCount: true },
    }),
  ]);

  const wordCount = aggregate._sum.wordCount ?? 0;

  await transaction.book.update({
    where: { id: bookId },
    data: {
      wordCount,
      chapterCount: chapters,
      writingProgress: computeWritingProgress(wordCount, book.targetWordCount),
    },
  });
}
