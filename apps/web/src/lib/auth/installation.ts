import "server-only";
import { checkSchema } from "@escribiendo/database";
import { scrubSecrets } from "@escribiendo/shared";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  classifyDatabaseError,
  readErrorCode,
  readErrorName,
  schemaOutdatedState,
  type DatabaseState,
} from "./database-state";

export type { DatabaseState } from "./database-state";

/**
 * Comprueba si la base de datos responde y si tiene el esquema esperado.
 *
 * Antes, un fallo de base de datos en `/login` o `/setup` se propagaba hasta
 * el límite de error y se mostraba como «Error inesperado», sin más
 * información. Con una base de datos sin migraciones aplicadas (P2021) o
 * inalcanzable (P1001) el diagnóstico correcto es lo que permite arreglar el
 * despliegue, así que se clasifica el fallo en lugar de ocultarlo.
 *
 * El error original se registra siempre en el log del servidor.
 */
export async function getDatabaseState(): Promise<DatabaseState> {
  try {
    const users = await prisma.user.count({ where: { deletedAt: null } });

    // Contar usuarios solo demuestra que la base responde. La aplicación
    // necesita además columnas concretas: si falta una migración, la sesión
    // falla después y el acceso acaba en un error sin explicación. Se
    // comprueba aquí, antes de tocar la sesión, para poder decirlo.
    if (!(await checkSchema())) {
      logger.error("db.schema_outdated", { hasUsers: users > 0 });

      return schemaOutdatedState();
    }

    return { status: "ready", hasUsers: users > 0 };
  } catch (error) {
    const failure = {
      errorCode: readErrorCode(error),
      errorName: readErrorName(error),
      errorMessage:
        error instanceof Error && typeof error.message === "string"
          ? scrubSecrets(error.message).slice(0, 500)
          : "",
    };

    logger.error("db.state_error", failure);

    return classifyDatabaseError(error, failure);
  }
}
