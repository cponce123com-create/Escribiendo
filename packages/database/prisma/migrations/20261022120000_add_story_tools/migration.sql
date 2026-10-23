-- Herramientas de historia: planificación, personajes y mundos.
--
-- Son tablas nuevas y aditivas: no modifican ninguna tabla existente. Cada
-- entrada puede pertenecer a un libro del estudio o quedar como material
-- general. El borrado es lógico (`deletedAt`) para conservar la trazabilidad.

CREATE TYPE "StoryPlanKind" AS ENUM ('ACT', 'CHAPTER', 'SCENE', 'SEQUENCE', 'OTHER');

CREATE TYPE "StoryPlanStatus" AS ENUM ('IDEA', 'PLANNED', 'WRITING', 'DONE');

CREATE TYPE "CharacterRole" AS ENUM (
  'PROTAGONIST',
  'ANTAGONIST',
  'SECONDARY',
  'MENTOR',
  'LOVE_INTEREST',
  'OTHER'
);

CREATE TYPE "WorldKind" AS ENUM (
  'PLACE',
  'CULTURE',
  'ORGANIZATION',
  'SYSTEM',
  'OBJECT',
  'EVENT',
  'OTHER'
);

CREATE TABLE "story_plan_items" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "bookId" UUID,
  "createdById" UUID,
  "title" VARCHAR(200) NOT NULL,
  "summary" TEXT,
  "kind" "StoryPlanKind" NOT NULL DEFAULT 'SCENE',
  "status" "StoryPlanStatus" NOT NULL DEFAULT 'IDEA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "story_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_characters" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "bookId" UUID,
  "createdById" UUID,
  "name" VARCHAR(160) NOT NULL,
  "role" "CharacterRole" NOT NULL DEFAULT 'OTHER',
  "age" VARCHAR(40),
  "occupation" VARCHAR(120),
  "summary" VARCHAR(300),
  "description" TEXT,
  "personality" TEXT,
  "motivation" TEXT,
  "conflict" TEXT,
  "arc" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "story_characters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_worlds" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "bookId" UUID,
  "createdById" UUID,
  "name" VARCHAR(160) NOT NULL,
  "kind" "WorldKind" NOT NULL DEFAULT 'PLACE',
  "summary" VARCHAR(300),
  "description" TEXT,
  "rules" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "story_worlds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "story_plan_items_workspaceId_bookId_idx"
  ON "story_plan_items"("workspaceId", "bookId");

CREATE INDEX "story_plan_items_workspaceId_status_idx"
  ON "story_plan_items"("workspaceId", "status");

CREATE INDEX "story_plan_items_workspaceId_createdAt_idx"
  ON "story_plan_items"("workspaceId", "createdAt");

CREATE INDEX "story_plan_items_createdById_idx" ON "story_plan_items"("createdById");

CREATE INDEX "story_plan_items_deletedAt_idx" ON "story_plan_items"("deletedAt");

CREATE INDEX "story_characters_workspaceId_bookId_idx"
  ON "story_characters"("workspaceId", "bookId");

CREATE INDEX "story_characters_workspaceId_role_idx"
  ON "story_characters"("workspaceId", "role");

CREATE INDEX "story_characters_workspaceId_createdAt_idx"
  ON "story_characters"("workspaceId", "createdAt");

CREATE INDEX "story_characters_createdById_idx" ON "story_characters"("createdById");

CREATE INDEX "story_characters_deletedAt_idx" ON "story_characters"("deletedAt");

CREATE INDEX "story_worlds_workspaceId_bookId_idx" ON "story_worlds"("workspaceId", "bookId");

CREATE INDEX "story_worlds_workspaceId_kind_idx" ON "story_worlds"("workspaceId", "kind");

CREATE INDEX "story_worlds_workspaceId_createdAt_idx"
  ON "story_worlds"("workspaceId", "createdAt");

CREATE INDEX "story_worlds_createdById_idx" ON "story_worlds"("createdById");

CREATE INDEX "story_worlds_deletedAt_idx" ON "story_worlds"("deletedAt");

ALTER TABLE "story_plan_items"
  ADD CONSTRAINT "story_plan_items_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_plan_items"
  ADD CONSTRAINT "story_plan_items_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_plan_items"
  ADD CONSTRAINT "story_plan_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "story_characters"
  ADD CONSTRAINT "story_characters_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_characters"
  ADD CONSTRAINT "story_characters_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_characters"
  ADD CONSTRAINT "story_characters_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "story_worlds"
  ADD CONSTRAINT "story_worlds_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_worlds"
  ADD CONSTRAINT "story_worlds_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "story_worlds"
  ADD CONSTRAINT "story_worlds_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
