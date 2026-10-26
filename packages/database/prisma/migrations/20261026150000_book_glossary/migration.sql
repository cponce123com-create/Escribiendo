-- Glosario por libro: términos con su definición.
-- Migración aditiva: crea una tabla nueva y no modifica datos existentes.

CREATE TABLE "book_glossary_terms" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "term" VARCHAR(160) NOT NULL,
    "definition" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_glossary_terms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "book_glossary_terms_bookId_term_key" ON "book_glossary_terms"("bookId", "term");

CREATE INDEX "book_glossary_terms_bookId_idx" ON "book_glossary_terms"("bookId");

ALTER TABLE "book_glossary_terms" ADD CONSTRAINT "book_glossary_terms_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
