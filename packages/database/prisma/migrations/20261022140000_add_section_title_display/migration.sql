-- El titulo editorial deja de ser solo un dato de navegacion y pasa a tener
-- opciones de visualizacion. Los valores por defecto conservan el comportamiento
-- anterior: se muestra el titulo, sin etiqueta de tipo ni numero.
ALTER TABLE "book_sections"
  ADD COLUMN "showTitle" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showSectionType" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showSectionNumber" BOOLEAN NOT NULL DEFAULT false;
