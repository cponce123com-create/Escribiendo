-- Alias de las fichas de la biblia de la historia.
--
-- La detección de menciones ya sabía trabajar con variantes del nombre
-- (`MentionEntity.aliases`), pero no había dónde guardarlas. La columna es
-- aditiva y con valor por defecto, así que no reescribe filas existentes.

ALTER TABLE "story_characters" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "story_worlds" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
