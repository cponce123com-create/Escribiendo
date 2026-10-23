/** Simulación por defecto. --apply registra índices antiguos como MANUAL sin tocar texto. */
import { config } from "dotenv";
import { PrismaClient } from "../packages/database/src/index";
config({ quiet: true });
const db = new PrismaClient();
const apply = process.argv.includes("--apply");
try {
  const sections = await db.bookSection.findMany({
    where: { type: "TABLE_OF_CONTENTS", deletedAt: null, book: { deletedAt: null } },
    select: { id: true, bookId: true },
    orderBy: { id: "asc" },
  });
  for (const section of sections) {
    const existing = await db.editorialMatter.findFirst({
      where: {
        bookId: section.bookId,
        kind: "TABLE_OF_CONTENTS",
        sectionId: section.id,
        deletedAt: null,
      },
    });
    if (existing) continue;
    console.log(
      JSON.stringify({
        bookId: section.bookId,
        sectionId: section.id,
        mode: apply ? "apply" : "dry-run",
      }),
    );
    if (apply)
      await db.$transaction(
        async (tx) => {
          const found = await tx.editorialMatter.findFirst({
            where: {
              bookId: section.bookId,
              kind: "TABLE_OF_CONTENTS",
              sectionId: section.id,
              deletedAt: null,
            },
          });
          if (!found)
            await tx.editorialMatter.create({
              data: {
                bookId: section.bookId,
                sectionId: section.id,
                kind: "TABLE_OF_CONTENTS",
                mode: "MANUAL",
                title: "Índice",
                data: { migration: "legacy-manual-toc-v1" },
              },
            });
        },
        { isolationLevel: "Serializable" },
      );
  }
} finally {
  await db.$disconnect();
}
