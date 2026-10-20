-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "writing_goals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookId" UUID,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetWords" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_comments" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "sectionId" UUID,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "editorial_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "writing_goals_userId_periodStart_idx" ON "writing_goals"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "writing_goals_bookId_idx" ON "writing_goals"("bookId");

-- CreateIndex
CREATE INDEX "editorial_comments_bookId_status_idx" ON "editorial_comments"("bookId", "status");

-- CreateIndex
CREATE INDEX "editorial_comments_sectionId_idx" ON "editorial_comments"("sectionId");

-- CreateIndex
CREATE INDEX "editorial_comments_authorId_createdAt_idx" ON "editorial_comments"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "editorial_comments_createdAt_idx" ON "editorial_comments"("createdAt");

-- AddForeignKey
ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones de integridad propias del proyecto.
-- Un objetivo de palabras negativo o un periodo invertido no significan nada.
ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_target_words_positive"
  CHECK ("targetWords" > 0);

ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_period_valid"
  CHECK ("periodEnd" > "periodStart");

-- Un comentario sin texto no es un comentario.
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_body_not_empty"
  CHECK (length(btrim("body")) > 0);

-- El estado y la marca de resolución no pueden contradecirse.
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_resolution_consistent"
  CHECK (
    ("status" = 'OPEN' AND "resolvedAt" IS NULL) OR
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL)
  );

COMMENT ON TABLE "writing_goals" IS
  'Objetivo de palabras por periodo. El objetivo por libro vive en books.targetWordCount.';

COMMENT ON TABLE "editorial_comments" IS
  'Comentarios editoriales visibles para el espacio de trabajo, anclados a un libro o a una seccion.';
