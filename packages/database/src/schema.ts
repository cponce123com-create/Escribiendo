/**
 * Comprobación del esquema de la base de datos.
 *
 * La aplicación y el esquema van por separado: las migraciones se aplican a
 * mano (`pnpm db:migrate`), no al arrancar. Si alguien despliega el código
 * nuevo sin aplicar la migración, Prisma falla con `P2022` (columna que no
 * existe) y la aplicación se cae entera con un «error de interfaz» que no
 * explica nada.
 *
 * Aquí se detecta ese caso para poder decir exactamente qué hacer.
 */
import { prisma } from "./client";

/** Columnas que la aplicación necesita y que solo existen tras migrar. */
const COLUMNAS_ESPERADAS: Array<{ tabla: string; columna: string }> = [
  { tabla: "sessions", columna: "workspaceId" },
  { tabla: "export_jobs", columna: "idempotencyKey" },
  { tabla: "books", columna: "writingProgress" },
];

/** Error de Prisma cuando falta una columna o una tabla. */
export function esEsquemaDesactualizado(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const codigo = (error as { code?: unknown }).code;

  if (codigo === "P2022" || codigo === "P2021") {
    return true;
  }

  const mensaje = (error as { message?: unknown }).message;

  return (
    typeof mensaje === "string" &&
    (mensaje.includes("does not exist") ||
      mensaje.includes("Unknown column") ||
      mensaje.includes("column does not exist"))
  );
}

/**
 * Indica si el esquema de la base de datos está al día.
 *
 * Comprueba las columnas que la aplicación usa y que se añadieron después del
 * primer despliegue.
 */
export async function checkSchema(timeoutMs = 3_000): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const consulta = prisma.$queryRaw<{ tabla: string; columna: string }[]>`
      SELECT table_name AS tabla, column_name AS columna
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `;
    const resultado = await Promise.race([
      consulta.then((columnas) =>
        COLUMNAS_ESPERADAS.every((esperada) =>
          columnas.some(
            (columna) => columna.tabla === esperada.tabla && columna.columna === esperada.columna,
          ),
        ),
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);

    return resultado;
  } catch {
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
