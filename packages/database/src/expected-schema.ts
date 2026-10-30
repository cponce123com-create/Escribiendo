/**
 * Columnas que la aplicación necesita y que solo existen después de migrar.
 *
 * Vive en un módulo sin Prisma para que la comprobación de estado
 * (`pnpm db:status`) y la aplicación usen exactamente la misma lista: si se
 * añade una columna nueva, se añade aquí una vez.
 *
 * Las claves usan los nombres reales de tabla y columna en PostgreSQL.
 */
export const COLUMNAS_ESPERADAS: ReadonlyArray<{ tabla: string; columna: string }> = [
  { tabla: "book_writing_briefs", columna: "content" },
  { tabla: "chapter_writing_briefs", columna: "content" },
  { tabla: "books", columna: "narrativeStructure" },
  { tabla: "books", columna: "importRequestId" },
  { tabla: "books", columna: "importPlanHash" },
  { tabla: "books", columna: "narrativeVersion" },
  { tabla: "book_sections", columna: "narrativeStage" },
  { tabla: "story_character_events", columna: "startsOn" },
  { tabla: "story_character_events", columna: "endsOn" },
  { tabla: "story_character_events", columna: "datePrecision" },
  { tabla: "story_character_suggestions", columna: "nameVerification" },
  { tabla: "laboratory_review_states", columna: "decisions" },
  { tabla: "sessions", columna: "workspaceId" },
  { tabla: "export_jobs", columna: "idempotencyKey" },
  { tabla: "books", columna: "writingProgress" },
  { tabla: "story_plan_items", columna: "kind" },
  { tabla: "story_plan_items", columna: "visual" },
  { tabla: "story_plan_items", columna: "parentId" },
  { tabla: "story_plan_items", columna: "sectionId" },
  { tabla: "story_plan_items", columna: "sortOrder" },
  { tabla: "story_plan_items", columna: "version" },
  { tabla: "story_plan_items", columna: "goal" },
  { tabla: "story_plan_items", columna: "conflict" },
  { tabla: "story_plan_items", columna: "outcome" },
  { tabla: "story_plan_items", columna: "targetWords" },

  { tabla: "story_characters", columna: "role" },
  { tabla: "story_characters", columna: "aliases" },
  { tabla: "story_worlds", columna: "kind" },
  { tabla: "story_worlds", columna: "aliases" },
  { tabla: "editorial_profiles", columna: "slug" },
  { tabla: "book_editorial_metadata", columna: "rightsHolder" },
  { tabla: "book_contributors", columna: "role" },
  { tabla: "book_identifiers", columna: "normalizedValue" },
  { tabla: "editorial_matters", columna: "templateVersion" },
  { tabla: "book_editions", columna: "publisherProfileId" },
  { tabla: "book_editions", columna: "editorialPreset" },
  { tabla: "book_editions", columna: "tocDepth" },
  { tabla: "book_editions", columna: "frontMatterRoman" },
];

export interface ColumnaDisponible {
  tabla: string;
  columna: string;
}

/**
 * Devuelve las columnas esperadas que no están en la base de datos.
 *
 * Se compara por nombre exacto: PostgreSQL conserva las mayúsculas de los
 * identificadores entre comillas, así que `workspaceId` y `workspaceid` no son
 * la misma columna.
 */
export function missingColumns(disponibles: ColumnaDisponible[]): ColumnaDisponible[] {
  return COLUMNAS_ESPERADAS.filter(
    (esperada) =>
      !disponibles.some(
        (columna) => columna.tabla === esperada.tabla && columna.columna === esperada.columna,
      ),
  ).map((esperada) => ({ ...esperada }));
}
