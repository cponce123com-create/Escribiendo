-- Preliminares, derechos y datos de publicación.
-- Aditiva: no modifica ni elimina datos existentes.

CREATE TYPE "EditorialMatterKind" AS ENUM (
  'HALF_TITLE', 'TITLE_PAGE', 'COPYRIGHT', 'CREDITS', 'DEDICATION', 'EPIGRAPH',
  'TABLE_OF_CONTENTS', 'LIST_OF_ILLUSTRATIONS', 'LIST_OF_TABLES', 'FOREWORD',
  'PREFACE', 'PROLOGUE', 'INTRODUCTION', 'EPILOGUE', 'CONCLUSION', 'APPENDIX',
  'ANNEX', 'GLOSSARY', 'BIBLIOGRAPHY', 'ANALYTICAL_INDEX', 'ACKNOWLEDGMENTS',
  'ABOUT_AUTHOR', 'OTHER_BOOKS', 'COLOPHON'
);
CREATE TYPE "EditorialMatterMode" AS ENUM ('AUTOMATIC', 'TEMPLATE', 'CUSTOM', 'MANUAL', 'DISABLED');
CREATE TYPE "BookContributorRole" AS ENUM (
  'COAUTHOR', 'EDITOR', 'PROOFREADER', 'TRANSLATOR', 'ILLUSTRATOR',
  'COVER_DESIGNER', 'TYPESETTER', 'PROLOGUE_AUTHOR', 'CONTRIBUTOR', 'OTHER'
);
CREATE TYPE "BookIdentifierType" AS ENUM ('ISBN_13', 'ISBN_10', 'DOI', 'LEGAL_DEPOSIT', 'OTHER');
CREATE TYPE "BookIdentifierStatus" AS ENUM ('PENDING', 'CHECKSUM_VALID', 'DECLARED', 'CONFIRMED', 'INVALID');
CREATE TYPE "LegalDepositStatus" AS ENUM (
  'PENDING', 'IN_PROGRESS', 'NUMBER_PROVIDED', 'DOCUMENTS_REVIEWED', 'READY_FOR_REVIEW'
);

ALTER TABLE "book_editions"
  ADD COLUMN "publisherProfileId" UUID,
  ADD COLUMN "publicationDate" TIMESTAMP(3),
  ADD COLUMN "printedBy" VARCHAR(200),
  ADD COLUMN "printRun" INTEGER,
  ADD COLUMN "legalDepositStatus" "LegalDepositStatus",
  ADD COLUMN "editorialPreset" VARCHAR(80),
  ADD COLUMN "tocDepth" VARCHAR(40),
  ADD COLUMN "frontMatterStyle" VARCHAR(40),
  ADD COLUMN "frontMatterRoman" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showFrontMatterFolios" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bodyStartOnPageOne" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tocIncludeFrontMatter" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "tocIncludeBackMatter" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "book_editorial_metadata" (
  "id" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "rightsHolder" VARCHAR(200),
  "imageRightsHolder" TEXT,
  "originalTitle" VARCHAR(300),
  "originalLanguage" VARCHAR(10),
  "translatorCredit" VARCHAR(200),
  "editionNumber" INTEGER,
  "editionLabel" VARCHAR(60),
  "publicationCountry" VARCHAR(2),
  "publicationCity" VARCHAR(120),
  "publicationYear" INTEGER,
  "rightsNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "book_editorial_metadata_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "editorial_profiles" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "imprint" VARCHAR(160),
  "legalName" VARCHAR(200),
  "taxId" VARCHAR(40),
  "contactEmail" VARCHAR(320),
  "website" VARCHAR(300),
  "logoUrl" TEXT,
  "address" VARCHAR(300),
  "city" VARCHAR(120),
  "country" VARCHAR(2) NOT NULL DEFAULT 'PE',
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "editorial_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "book_contributors" (
  "id" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "role" "BookContributorRole" NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "creditName" VARCHAR(200),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "book_contributors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "book_identifiers" (
  "id" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "editionId" UUID,
  "type" "BookIdentifierType" NOT NULL,
  "value" VARCHAR(80) NOT NULL,
  "normalizedValue" VARCHAR(80) NOT NULL,
  "status" "BookIdentifierStatus" NOT NULL DEFAULT 'PENDING',
  "note" VARCHAR(300),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "book_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "editorial_matters" (
  "id" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "sectionId" UUID,
  "kind" "EditorialMatterKind" NOT NULL,
  "mode" "EditorialMatterMode" NOT NULL DEFAULT 'AUTOMATIC',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "title" VARCHAR(300),
  "templateSlug" VARCHAR(80),
  "templateVersion" INTEGER,
  "data" JSONB NOT NULL DEFAULT '{}',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "showInToc" BOOLEAN NOT NULL DEFAULT true,
  "includeInExport" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "editorial_matters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "book_editorial_metadata_bookId_key" ON "book_editorial_metadata"("bookId");
CREATE UNIQUE INDEX "editorial_profiles_workspaceId_slug_key" ON "editorial_profiles"("workspaceId", "slug");
CREATE INDEX "editorial_profiles_workspaceId_deletedAt_idx" ON "editorial_profiles"("workspaceId", "deletedAt");
CREATE UNIQUE INDEX "book_contributors_bookId_role_name_key" ON "book_contributors"("bookId", "role", "name");
CREATE INDEX "book_contributors_bookId_role_sortOrder_idx" ON "book_contributors"("bookId", "role", "sortOrder");
CREATE UNIQUE INDEX "book_identifiers_bookId_type_normalizedValue_key" ON "book_identifiers"("bookId", "type", "normalizedValue");
CREATE INDEX "book_identifiers_bookId_type_idx" ON "book_identifiers"("bookId", "type");
CREATE INDEX "book_identifiers_editionId_type_idx" ON "book_identifiers"("editionId", "type");
CREATE INDEX "book_identifiers_normalizedValue_idx" ON "book_identifiers"("normalizedValue");
CREATE INDEX "editorial_matters_bookId_kind_sortOrder_idx" ON "editorial_matters"("bookId", "kind", "sortOrder");
CREATE INDEX "editorial_matters_bookId_enabled_idx" ON "editorial_matters"("bookId", "enabled");
CREATE INDEX "editorial_matters_sectionId_idx" ON "editorial_matters"("sectionId");
CREATE INDEX "book_editions_publisherProfileId_idx" ON "book_editions"("publisherProfileId");

ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_publisherProfileId_fkey"
  FOREIGN KEY ("publisherProfileId") REFERENCES "editorial_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "book_editorial_metadata" ADD CONSTRAINT "book_editorial_metadata_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_profiles" ADD CONSTRAINT "editorial_profiles_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "book_contributors" ADD CONSTRAINT "book_contributors_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "book_identifiers" ADD CONSTRAINT "book_identifiers_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "book_identifiers" ADD CONSTRAINT "book_identifiers_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_matters" ADD CONSTRAINT "editorial_matters_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_matters" ADD CONSTRAINT "editorial_matters_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
