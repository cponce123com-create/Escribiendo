-- Una confirmación de importación se vincula a su plan exacto y solo crea un libro.
-- Ambas columnas son opcionales para conservar los libros existentes.
ALTER TABLE "books" ADD COLUMN "importRequestId" UUID;
ALTER TABLE "books" ADD COLUMN "importPlanHash" VARCHAR(64);
CREATE UNIQUE INDEX "books_workspaceId_importRequestId_key" ON "books"("workspaceId", "importRequestId");
