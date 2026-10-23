CREATE TYPE "CharacterRelationshipKind" AS ENUM ('FAMILY', 'FRIENDSHIP', 'ROMANCE', 'RIVALRY', 'CONFLICT', 'ALLIANCE', 'OTHER');
CREATE TABLE "story_character_relations" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "bookId" UUID NOT NULL,
 "sourceCharacterId" UUID NOT NULL, "targetCharacterId" UUID NOT NULL,
 "kind" "CharacterRelationshipKind" NOT NULL, "description" VARCHAR(300),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "story_character_relations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "story_character_events" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "bookId" UUID NOT NULL,
 "characterId" UUID NOT NULL, "sectionId" UUID, "title" VARCHAR(200) NOT NULL,
 "details" TEXT, "sourceExcerpt" TEXT, "sequence" INTEGER NOT NULL DEFAULT 0,
 "suggested" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "story_character_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "story_character_relations_sourceCharacterId_targetCharacterId_kind_key" ON "story_character_relations"("sourceCharacterId","targetCharacterId","kind");
CREATE INDEX "story_character_relations_workspaceId_bookId_idx" ON "story_character_relations"("workspaceId","bookId");
CREATE INDEX "story_character_events_workspaceId_bookId_characterId_sequence_idx" ON "story_character_events"("workspaceId","bookId","characterId","sequence");
CREATE INDEX "story_character_events_sectionId_idx" ON "story_character_events"("sectionId");
ALTER TABLE "story_character_relations" ADD CONSTRAINT "story_character_relations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_relations" ADD CONSTRAINT "story_character_relations_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_relations" ADD CONSTRAINT "story_character_relations_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "story_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_relations" ADD CONSTRAINT "story_character_relations_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "story_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_events" ADD CONSTRAINT "story_character_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_events" ADD CONSTRAINT "story_character_events_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_character_events" ADD CONSTRAINT "story_character_events_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "story_characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
