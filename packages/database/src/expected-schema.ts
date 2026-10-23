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
  { tabla: "sessions", columna: "workspaceId" },
  { tabla: "export_jobs", columna: "idempotencyKey" },
  { tabla: "books", columna: "writingProgress" },
  { tabla: "story_plan_items", columna: "kind" },
  { tabla: "story_characters", columna: "role" },
  { tabla: "story_worlds", columna: "kind" },
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
