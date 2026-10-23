CREATE TYPE "CharacterAnalysisTaskStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','SUPERSEDED');
CREATE TYPE "CharacterSuggestionStatus" AS ENUM ('PENDING','ACCEPTED','DISCARDED','MERGED');
CREATE TABLE "character_analysis_tasks" (
  "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "bookId" UUID NOT NULL, "sectionId" UUID NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL, "status" "CharacterAnalysisTaskStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3),
  CONSTRAINT "character_analysis_tasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "story_character_suggestions" (
  "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "bookId" UUID NOT NULL, "sectionId" UUID NOT NULL,
  "characterId" UUID, "contentHash" VARCHAR(64) NOT NULL, "normalizedName" VARCHAR(160) NOT NULL,
  "suggestedName" VARCHAR(160) NOT NULL, "suggestedAge" VARCHAR(40), "suggestedDescription" TEXT,
  "excerpt" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "mentions" INTEGER NOT NULL DEFAULT 1,
  "status" "CharacterSuggestionStatus" NOT NULL DEFAULT 'PENDING', "stale" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_character_suggestions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "character_analysis_tasks_sectionId_contentHash_key" ON "character_analysis_tasks"("sectionId","contentHash");
CREATE INDEX "character_analysis_tasks_workspaceId_status_createdAt_idx" ON "character_analysis_tasks"("workspaceId","status","createdAt");
CREATE UNIQUE INDEX "story_character_suggestions_bookId_normalizedName_key" ON "story_character_suggestions"("bookId","normalizedName");
CREATE INDEX "story_character_suggestions_workspaceId_bookId_status_stale_idx" ON "story_character_suggestions"("workspaceId","bookId","status","stale");
CREATE INDEX "story_character_suggestions_characterId_idx" ON "story_character_suggestions"("characterId");
ALTER TABLE "character_analysis_tasks" ADD CONSTRAINT "character_analysis_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_analysis_tasks" ADD CONSTRAINT "character_analysis_tasks_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_analysis_tasks" ADD CONSTRAINT "character_analysis_tasks_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_suggestions" ADD CONSTRAINT "story_character_suggestions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_suggestions" ADD CONSTRAINT "story_character_suggestions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_suggestions" ADD CONSTRAINT "story_character_suggestions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_suggestions" ADD CONSTRAINT "story_character_suggestions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "story_characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
