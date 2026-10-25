-- AlterTable
ALTER TABLE "books" ADD COLUMN     "narrativeStructure" VARCHAR(24) NOT NULL DEFAULT 'FREE',
ADD COLUMN     "narrativeVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "book_sections" ADD COLUMN     "narrativeStage" VARCHAR(64);

-- AlterTable
ALTER TABLE "story_character_events" ADD COLUMN     "datePrecision" VARCHAR(16) NOT NULL DEFAULT 'UNDATED',
ADD COLUMN     "endsOn" VARCHAR(10),
ADD COLUMN     "startsOn" VARCHAR(10);

-- CreateTable
CREATE TABLE "laboratory_review_states" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "disabledRules" JSONB NOT NULL DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laboratory_review_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "laboratory_review_states_workspaceId_userId_idx" ON "laboratory_review_states"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "laboratory_review_states_bookId_userId_key" ON "laboratory_review_states"("bookId", "userId");

-- AddForeignKey
ALTER TABLE "laboratory_review_states" ADD CONSTRAINT "laboratory_review_states_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_review_states" ADD CONSTRAINT "laboratory_review_states_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_review_states" ADD CONSTRAINT "laboratory_review_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

