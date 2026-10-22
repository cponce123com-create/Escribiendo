/**
 * Clasificación de los fallos de base de datos.
 *
 * Vive en un módulo sin `server-only` para poder verificarla con pruebas
 * unitarias: es la pieza que decide si el fallo es «faltan migraciones» o
 * «no hay conexión», y esa distinción es la que se muestra al operador.
 */

/** El esquema no coincide con el código: faltan migraciones por aplicar. */
const MISSING_SCHEMA_CODES = new Set(["P2021", "P2022"]);

/** No se puede establecer la conexión con el servidor de base de datos. */
const CONNECTION_CODES = new Set(["P1000", "P1001", "P1002", "P1003", "P1017"]);

export type DatabaseFailure = {
  errorCode: string;
  errorName: string;
  errorMessage: string;
};

export type DatabaseState =
  | { status: "ready"; hasUsers: boolean }
  | ({ status: "not-migrated" } & DatabaseFailure)
  | ({ status: "unavailable" } & DatabaseFailure);

/** Lee el código de error de Prisma o de otro proveedor. */
export function readErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "UNKNOWN";
  }

  const candidate = error as { code?: unknown; errorCode?: unknown };

  if (typeof candidate.code === "string") {
    return candidate.code;
  }

  if (typeof candidate.errorCode === "string") {
    return candidate.errorCode;
  }

  return "UNKNOWN";
}

/** Nombre de la clase del error, útil cuando no hay código. */
export function readErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return "UnknownError";
}

/**
 * Estado de una base que responde pero no tiene el esquema que espera el
 * código. Se usa cuando la conexión funciona y la comprobación de columnas
 * detecta que falta una migración: no hay un error de Prisma que clasificar,
 * pero el resultado para quien opera la aplicación es el mismo.
 */
export function schemaOutdatedState(): DatabaseState {
  return {
    status: "not-migrated",
    errorCode: "P2022",
    errorName: "EsquemaDesactualizado",
    errorMessage: "La base de datos no tiene todas las columnas que espera la aplicación.",
  };
}

/**
 * Decide a qué estado corresponde un fallo de base de datos.
 *
 * `not-migrated` significa que la base responde pero le falta el esquema:
 * la causa es que no se aplicaron las migraciones.
 */
export function classifyDatabaseError(error: unknown, failure: DatabaseFailure): DatabaseState {
  if (MISSING_SCHEMA_CODES.has(failure.errorCode)) {
    return { status: "not-migrated", ...failure };
  }

  if (
    CONNECTION_CODES.has(failure.errorCode) ||
    failure.errorName === "PrismaClientInitializationError"
  ) {
    return { status: "unavailable", ...failure };
  }

  return { status: "unavailable", ...failure };
}
