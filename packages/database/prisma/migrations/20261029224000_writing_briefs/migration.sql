-- CreateTable
CREATE TABLE "book_writing_briefs" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_writing_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_writing_briefs" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_writing_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_writing_briefs_bookId_version_key" ON "book_writing_briefs"("bookId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_writing_briefs_sectionId_version_key" ON "chapter_writing_briefs"("sectionId", "version");

-- AddForeignKey
ALTER TABLE "book_writing_briefs" ADD CONSTRAINT "book_writing_briefs_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_writing_briefs" ADD CONSTRAINT "chapter_writing_briefs_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

