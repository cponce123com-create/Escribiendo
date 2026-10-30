-- AlterTable
ALTER TABLE "story_plan_items" ADD COLUMN     "conflict" TEXT,
ADD COLUMN     "goal" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "parentId" UUID,
ADD COLUMN     "sectionId" UUID,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "targetWords" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Widen only: existing titles remain valid. Checked against the prior VARCHAR size.
ALTER TABLE "story_plan_items" ALTER COLUMN "title" SET DATA TYPE VARCHAR(300);

-- CreateIndex
CREATE UNIQUE INDEX "story_plan_items_sectionId_key" ON "story_plan_items"("sectionId");

-- CreateIndex
CREATE INDEX "story_plan_items_bookId_parentId_sortOrder_idx" ON "story_plan_items"("bookId", "parentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "story_plan_items" ADD CONSTRAINT "story_plan_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "story_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_plan_items" ADD CONSTRAINT "story_plan_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

