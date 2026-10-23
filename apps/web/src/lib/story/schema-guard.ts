import "server-only";
import { redirect } from "next/navigation";
import { esEsquemaDesactualizado } from "@escribiendo/database";

/**
 * Carga datos de las herramientas de historia protegiendo el caso en el que
 * la migración todavía no se ha aplicado.
 *
 * Si el código llega a producción antes que la migración, Prisma falla con
 * `P2021` (tabla que no existe). En lugar de mostrar un error de interfaz, se
 * lleva a la pantalla de migración pendiente, que explica qué hacer.
 */
export async function guardStorySchema<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (esEsquemaDesactualizado(error)) {
      redirect("/migracion-pendiente");
    }

    throw error;
  }
}
