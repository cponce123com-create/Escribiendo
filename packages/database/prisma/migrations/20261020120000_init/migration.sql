-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'AUTHOR', 'EDITOR', 'REVIEWER');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'AUTHOR', 'REVIEWER');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('HALF_TITLE', 'TITLE_PAGE', 'COPYRIGHT', 'DEDICATION', 'EPIGRAPH', 'TABLE_OF_CONTENTS', 'FOREWORD', 'PROLOGUE', 'INTRODUCTION', 'PART', 'CHAPTER', 'SUBCHAPTER', 'INTERLUDE', 'EPILOGUE', 'ACKNOWLEDGMENTS', 'AUTHOR_NOTES', 'ABOUT_AUTHOR', 'BIBLIOGRAPHY', 'GLOSSARY', 'APPENDIX', 'OTHER_BOOKS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RevisionReason" AS ENUM ('AUTO', 'MANUAL', 'RESTORE', 'IMPORT');

-- CreateEnum
CREATE TYPE "BookFormat" AS ENUM ('A4', 'A5', 'B5', 'INCH_5X8', 'INCH_5_5X8_5', 'INCH_6X9', 'POCKET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('CLOUDINARY');

-- CreateEnum
CREATE TYPE "AssetResourceType" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('COVER_FRONT', 'COVER_BACK', 'SPINE', 'FULL_COVER', 'INTERIOR_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF_DIGITAL', 'PDF_PRINT', 'EPUB3', 'DOCX');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'AUTHOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'AUTHOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "subtitle" VARCHAR(300),
    "authorName" VARCHAR(200) NOT NULL,
    "penName" VARCHAR(200),
    "description" TEXT,
    "genre" VARCHAR(100),
    "language" VARCHAR(10) NOT NULL DEFAULT 'es',
    "status" "BookStatus" NOT NULL DEFAULT 'DRAFT',
    "targetWordCount" INTEGER,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "chapterCount" INTEGER NOT NULL DEFAULT 0,
    "writingProgress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_sections" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "parentId" UUID,
    "type" "SectionType" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "showInToc" BOOLEAN NOT NULL DEFAULT true,
    "includeInExport" BOOLEAN NOT NULL DEFAULT true,
    "pageBreakBefore" BOOLEAN NOT NULL DEFAULT false,
    "startOnOddPage" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "book_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_revisions" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "reason" "RevisionReason" NOT NULL DEFAULT 'AUTO',
    "title" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_editions" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "layoutProfileId" UUID,
    "editorialTemplateId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "format" "BookFormat" NOT NULL DEFAULT 'A5',
    "status" "EditionStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "pageCount" INTEGER,
    "paperStock" VARCHAR(120),
    "spineWidthMm" DECIMAL(6,2),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_profiles" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "format" "BookFormat" NOT NULL DEFAULT 'A5',
    "pageWidthMm" DECIMAL(6,2) NOT NULL,
    "pageHeightMm" DECIMAL(6,2) NOT NULL,
    "marginTopMm" DECIMAL(6,2) NOT NULL,
    "marginBottomMm" DECIMAL(6,2) NOT NULL,
    "marginInnerMm" DECIMAL(6,2) NOT NULL,
    "marginOuterMm" DECIMAL(6,2) NOT NULL,
    "gutterMm" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "bleedMm" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "headerDistanceMm" DECIMAL(6,2) NOT NULL DEFAULT 8,
    "footerDistanceMm" DECIMAL(6,2) NOT NULL DEFAULT 8,
    "mirrorMargins" BOOLEAN NOT NULL DEFAULT true,
    "showPageNumbers" BOOLEAN NOT NULL DEFAULT true,
    "chapterStartsRecto" BOOLEAN NOT NULL DEFAULT true,
    "typographyConfig" JSONB NOT NULL DEFAULT '{}',
    "advancedConfig" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "layout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_templates" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "editorial_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID,
    "provider" "StorageProvider" NOT NULL DEFAULT 'CLOUDINARY',
    "resourceType" "AssetResourceType" NOT NULL DEFAULT 'IMAGE',
    "publicId" VARCHAR(512) NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "format" VARCHAR(20) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "originalFilename" VARCHAR(255),
    "version" VARCHAR(40),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_assets" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "caption" VARCHAR(300),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "editionId" UUID,
    "requestedById" UUID,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "manuscriptHash" VARCHAR(64) NOT NULL,
    "sectionVersions" JSONB NOT NULL DEFAULT '[]',
    "options" JSONB NOT NULL DEFAULT '{}',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(80),
    "errorMessage" TEXT,
    "resultMetadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_notes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "sectionId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "writing_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64),
    "requestId" VARCHAR(64),
    "ipHash" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");

-- CreateIndex
CREATE INDEX "workspaces_deletedAt_idx" ON "workspaces"("deletedAt");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE INDEX "workspace_members_workspaceId_role_idx" ON "workspace_members"("workspaceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_expiresAt_idx" ON "password_reset_tokens"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "books_workspaceId_deletedAt_idx" ON "books"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "books_workspaceId_status_idx" ON "books"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "books_workspaceId_updatedAt_idx" ON "books"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "books_archivedAt_idx" ON "books"("archivedAt");

-- CreateIndex
CREATE INDEX "book_sections_bookId_parentId_sortOrder_idx" ON "book_sections"("bookId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "book_sections_bookId_type_idx" ON "book_sections"("bookId", "type");

-- CreateIndex
CREATE INDEX "book_sections_bookId_deletedAt_idx" ON "book_sections"("bookId", "deletedAt");

-- CreateIndex
CREATE INDEX "section_revisions_sectionId_createdAt_idx" ON "section_revisions"("sectionId", "createdAt");

-- CreateIndex
CREATE INDEX "section_revisions_createdById_idx" ON "section_revisions"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "section_revisions_sectionId_version_key" ON "section_revisions"("sectionId", "version");

-- CreateIndex
CREATE INDEX "book_editions_bookId_isDefault_idx" ON "book_editions"("bookId", "isDefault");

-- CreateIndex
CREATE INDEX "book_editions_layoutProfileId_idx" ON "book_editions"("layoutProfileId");

-- CreateIndex
CREATE INDEX "book_editions_editorialTemplateId_idx" ON "book_editions"("editorialTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "book_editions_bookId_name_key" ON "book_editions"("bookId", "name");

-- CreateIndex
CREATE INDEX "layout_profiles_workspaceId_isDefault_idx" ON "layout_profiles"("workspaceId", "isDefault");

-- CreateIndex
CREATE INDEX "layout_profiles_workspaceId_deletedAt_idx" ON "layout_profiles"("workspaceId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "layout_profiles_workspaceId_name_key" ON "layout_profiles"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "editorial_templates_workspaceId_idx" ON "editorial_templates"("workspaceId");

-- CreateIndex
CREATE INDEX "editorial_templates_isSystem_idx" ON "editorial_templates"("isSystem");

-- CreateIndex
CREATE INDEX "editorial_templates_deletedAt_idx" ON "editorial_templates"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_templates_workspaceId_slug_key" ON "editorial_templates"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "assets_publicId_key" ON "assets"("publicId");

-- CreateIndex
CREATE INDEX "assets_workspaceId_createdAt_idx" ON "assets"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "assets_workspaceId_deletedAt_idx" ON "assets"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "assets_createdById_idx" ON "assets"("createdById");

-- CreateIndex
CREATE INDEX "book_assets_bookId_kind_sortOrder_idx" ON "book_assets"("bookId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "book_assets_assetId_idx" ON "book_assets"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "book_assets_bookId_assetId_kind_key" ON "book_assets"("bookId", "assetId", "kind");

-- CreateIndex
CREATE INDEX "export_jobs_bookId_createdAt_idx" ON "export_jobs"("bookId", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_status_createdAt_idx" ON "export_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_editionId_idx" ON "export_jobs"("editionId");

-- CreateIndex
CREATE INDEX "export_jobs_requestedById_idx" ON "export_jobs"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "export_jobs_bookId_idempotencyKey_key" ON "export_jobs"("bookId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "writing_notes_userId_isPinned_updatedAt_idx" ON "writing_notes"("userId", "isPinned", "updatedAt");

-- CreateIndex
CREATE INDEX "writing_notes_bookId_idx" ON "writing_notes"("bookId");

-- CreateIndex
CREATE INDEX "writing_notes_sectionId_idx" ON "writing_notes"("sectionId");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sections" ADD CONSTRAINT "book_sections_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sections" ADD CONSTRAINT "book_sections_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_revisions" ADD CONSTRAINT "section_revisions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_revisions" ADD CONSTRAINT "section_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_layoutProfileId_fkey" FOREIGN KEY ("layoutProfileId") REFERENCES "layout_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_editorialTemplateId_fkey" FOREIGN KEY ("editorialTemplateId") REFERENCES "editorial_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layout_profiles" ADD CONSTRAINT "layout_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_templates" ADD CONSTRAINT "editorial_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assets" ADD CONSTRAINT "book_assets_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assets" ADD CONSTRAINT "book_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_notes" ADD CONSTRAINT "writing_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_notes" ADD CONSTRAINT "writing_notes_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_notes" ADD CONSTRAINT "writing_notes_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- ESCRIBIENDO: invariantes adicionales
--
-- Prisma no expresa CHECK constraints ni indices parciales. Estas reglas se
-- mantienen en la migracion para que tambien protejan escrituras realizadas
-- por scripts, tareas de mantenimiento o futuras integraciones.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_failed_login_attempts_nonnegative"
  CHECK ("failedLoginAttempts" >= 0);

ALTER TABLE "books"
  ADD CONSTRAINT "books_counts_nonnegative"
  CHECK ("wordCount" >= 0 AND "chapterCount" >= 0 AND ("targetWordCount" IS NULL OR "targetWordCount" >= 0));

ALTER TABLE "books"
  ADD CONSTRAINT "books_writing_progress_range"
  CHECK ("writingProgress" >= 0 AND "writingProgress" <= 100);

ALTER TABLE "book_sections"
  ADD CONSTRAINT "book_sections_version_positive"
  CHECK ("version" >= 1);

ALTER TABLE "book_sections"
  ADD CONSTRAINT "book_sections_word_count_nonnegative"
  CHECK ("wordCount" >= 0);

ALTER TABLE "section_revisions"
  ADD CONSTRAINT "section_revisions_version_positive"
  CHECK ("version" >= 1);

ALTER TABLE "section_revisions"
  ADD CONSTRAINT "section_revisions_word_count_nonnegative"
  CHECK ("wordCount" >= 0);

ALTER TABLE "layout_profiles"
  ADD CONSTRAINT "layout_profiles_dimensions_positive"
  CHECK ("pageWidthMm" > 0 AND "pageHeightMm" > 0);

ALTER TABLE "layout_profiles"
  ADD CONSTRAINT "layout_profiles_margins_nonnegative"
  CHECK (
    "marginTopMm" >= 0 AND
    "marginBottomMm" >= 0 AND
    "marginInnerMm" >= 0 AND
    "marginOuterMm" >= 0 AND
    "gutterMm" >= 0 AND
    "bleedMm" >= 0 AND
    "headerDistanceMm" >= 0 AND
    "footerDistanceMm" >= 0
  );

ALTER TABLE "export_jobs"
  ADD CONSTRAINT "export_jobs_progress_range"
  CHECK ("progress" >= 0 AND "progress" <= 100);

-- Solo puede existir una edicion predeterminada por libro.
CREATE UNIQUE INDEX "book_editions_one_default_per_book_key"
  ON "book_editions" ("bookId")
  WHERE "isDefault" = true;

-- Solo puede existir un perfil de maqueta predeterminado y activo por espacio.
CREATE UNIQUE INDEX "layout_profiles_one_default_per_workspace_key"
  ON "layout_profiles" ("workspaceId")
  WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- Las plantillas del sistema no pertenecen a un espacio y deben tener un slug
-- unico. El indice UNIQUE compuesto de Prisma no cubre los NULL de workspaceId.
CREATE UNIQUE INDEX "editorial_templates_system_slug_key"
  ON "editorial_templates" ("slug")
  WHERE "isSystem" = true AND "workspaceId" IS NULL;

-- Las revisiones son inmutables: restaurar una version crea una revision nueva.
CREATE OR REPLACE FUNCTION "escribiendo_reject_section_revision_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'section_revisions es inmutable: no se puede modificar la revision %', OLD."id"
    USING ERRCODE = '23001';
END;
$$;

CREATE TRIGGER "section_revisions_immutable"
  BEFORE UPDATE ON "section_revisions"
  FOR EACH ROW
  EXECUTE FUNCTION "escribiendo_reject_section_revision_update"();

COMMENT ON TABLE "section_revisions" IS
  'Historial inmutable de contenido por seccion. Actualizar una fila esta prohibido por trigger.';
COMMENT ON TABLE "audit_logs" IS
  'Registro de acciones. Nunca debe contener secretos ni contenido de manuscritos.';
COMMENT ON COLUMN "sessions"."tokenHash" IS
  'SHA-256 del token opaco. El token original solo existe en la cookie del navegador.';
COMMENT ON COLUMN "password_reset_tokens"."tokenHash" IS
  'SHA-256 del token de recuperacion. El token original solo se muestra una vez por CLI.';