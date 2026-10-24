CREATE TYPE "NarrativeEvidenceMode" AS ENUM ('NARRATION', 'DIALOGUE', 'RECOLLECTION', 'HYPOTHESIS');
CREATE TYPE "NarrativeFactReviewStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED', 'STALE');
CREATE TYPE "NarrativeFindingStatus" AS ENUM ('OPEN', 'CONFIRMED', 'TEXT_CORRECTED', 'IGNORED', 'INTENTIONAL', 'FACT_UPDATED');

CREATE TABLE "narrative_facts" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "sectionId" UUID NOT NULL,
  "revisionId" UUID,
  "contentVersion" INTEGER NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "factType" VARCHAR(40) NOT NULL,
  "subjectLabel" VARCHAR(160) NOT NULL,
  "subjectNormalized" VARCHAR(160) NOT NULL,
  "valueText" VARCHAR(300) NOT NULL,
  "normalizedValue" VARCHAR(300) NOT NULL,
  "evidenceMode" "NarrativeEvidenceMode" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "temporalYear" INTEGER,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "exactQuote" TEXT NOT NULL,
  "ruleVersion" VARCHAR(40) NOT NULL,
  "authorValueOverride" VARCHAR(300),
  "authorNormalizedOverride" VARCHAR(300),
  "overrideById" UUID,
  "overrideAt" TIMESTAMP(3),
  "reviewStatus" "NarrativeFactReviewStatus" NOT NULL DEFAULT 'PROPOSED',
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "narrative_facts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "narrative_finding_decisions" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "findingKey" VARCHAR(64) NOT NULL,
  "findingType" VARCHAR(40) NOT NULL,
  "factAId" UUID NOT NULL,
  "factBId" UUID,
  "status" "NarrativeFindingStatus" NOT NULL DEFAULT 'OPEN',
  "note" VARCHAR(500),
  "decidedById" UUID NOT NULL,
  "decisionVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "narrative_finding_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "narrative_section_analyses" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "bookId" UUID NOT NULL,
  "sectionId" UUID NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "ruleVersion" VARCHAR(40) NOT NULL,
  "factsCount" INTEGER NOT NULL DEFAULT 0,
  "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "narrative_section_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "narrative_finding_decision_history" (
  "id" UUID NOT NULL,
  "decisionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "NarrativeFindingStatus" NOT NULL,
  "note" VARCHAR(500),
  "decidedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "narrative_finding_decision_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "narrative_facts_sectionId_contentHash_startOffset_endOffset_factType_key"
  ON "narrative_facts"("sectionId", "contentHash", "startOffset", "endOffset", "factType");
CREATE INDEX "narrative_facts_workspaceId_bookId_reviewStatus_idx"
  ON "narrative_facts"("workspaceId", "bookId", "reviewStatus");
CREATE INDEX "narrative_facts_bookId_sectionId_contentVersion_idx"
  ON "narrative_facts"("bookId", "sectionId", "contentVersion");
CREATE INDEX "narrative_facts_bookId_subjectNormalized_factType_idx"
  ON "narrative_facts"("bookId", "subjectNormalized", "factType");
CREATE UNIQUE INDEX "narrative_finding_decisions_findingKey_key"
  ON "narrative_finding_decisions"("findingKey");
CREATE INDEX "narrative_finding_decisions_workspaceId_bookId_status_updatedAt_idx"
  ON "narrative_finding_decisions"("workspaceId", "bookId", "status", "updatedAt");
CREATE INDEX "narrative_finding_decisions_factAId_idx"
  ON "narrative_finding_decisions"("factAId");
CREATE INDEX "narrative_finding_decisions_factBId_idx"
  ON "narrative_finding_decisions"("factBId");
CREATE UNIQUE INDEX "narrative_section_analyses_sectionId_contentHash_key"
  ON "narrative_section_analyses"("sectionId", "contentHash");
CREATE INDEX "narrative_section_analyses_workspaceId_bookId_analyzedAt_idx"
  ON "narrative_section_analyses"("workspaceId", "bookId", "analyzedAt");
CREATE INDEX "narrative_section_analyses_bookId_sectionId_contentVersion_idx"
  ON "narrative_section_analyses"("bookId", "sectionId", "contentVersion");
CREATE UNIQUE INDEX "narrative_finding_decision_history_decisionId_version_key"
  ON "narrative_finding_decision_history"("decisionId", "version");
CREATE INDEX "narrative_finding_decision_history_decisionId_createdAt_idx"
  ON "narrative_finding_decision_history"("decisionId", "createdAt");
CREATE INDEX "narrative_finding_decision_history_decidedById_createdAt_idx"
  ON "narrative_finding_decision_history"("decidedById", "createdAt");

ALTER TABLE "narrative_facts" ADD CONSTRAINT "narrative_facts_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_facts" ADD CONSTRAINT "narrative_facts_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_facts" ADD CONSTRAINT "narrative_facts_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_facts" ADD CONSTRAINT "narrative_facts_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "section_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "narrative_facts" ADD CONSTRAINT "narrative_facts_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "narrative_facts" ADD CONSTRAINT "narrative_facts_overrideById_fkey"
  FOREIGN KEY ("overrideById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "narrative_section_analyses" ADD CONSTRAINT "narrative_section_analyses_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_section_analyses" ADD CONSTRAINT "narrative_section_analyses_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_section_analyses" ADD CONSTRAINT "narrative_section_analyses_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decisions" ADD CONSTRAINT "narrative_finding_decisions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decisions" ADD CONSTRAINT "narrative_finding_decisions_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decisions" ADD CONSTRAINT "narrative_finding_decisions_factAId_fkey"
  FOREIGN KEY ("factAId") REFERENCES "narrative_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decisions" ADD CONSTRAINT "narrative_finding_decisions_factBId_fkey"
  FOREIGN KEY ("factBId") REFERENCES "narrative_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decisions" ADD CONSTRAINT "narrative_finding_decisions_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decision_history" ADD CONSTRAINT "narrative_finding_decision_history_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "narrative_finding_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_finding_decision_history" ADD CONSTRAINT "narrative_finding_decision_history_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
