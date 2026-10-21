import path from "node:path";
import { config as loadEnv } from "dotenv";
import { prisma } from "../../packages/database/src/client";
import { repoRoot } from "../../scripts/lib/prisma-cli";
import {
  assertDisposableDatabase,
  databaseHost,
  databaseName,
} from "../../scripts/lib/e2e-database";

export { assertDisposableDatabase, databaseHost, databaseName };

/**
 * Preparación global de las pruebas de extremo a extremo.
 *
 * 1. Carga el `.env` de la raíz (Playwright no lo hace por su cuenta).
 * 2. Comprueba que la base de datos es desechable antes de tocar nada.
 * 3. Vacía todas las tablas para que la instalación inicial vuelva a estar
 *    disponible y el flujo sea reproducible.
 *
 * El paso 2 es una salvaguarda: ejecutar esto contra una base real destruiría
 * sus datos.
 */

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

export interface E2EConfig {
  setupToken: string;
  userEmail: string;
  userPassword: string;
}

const DEFAULT_USER_EMAIL = "e2e@ejemplo.local";
// La contraseña no debe contener el nombre ni la parte local del correo: la
// aplicación rechaza esa combinación, así que la fixture tampoco debe
// contenerla.
const DEFAULT_USER_PASSWORD = "V3rdura-Cont3nido-S3guro-2026";

/** Lee la configuración de las pruebas desde el entorno. */
export function readE2EConfig(): E2EConfig {
  const setupToken = process.env.E2E_SETUP_TOKEN ?? process.env.SETUP_TOKEN ?? "";

  if (setupToken.length < 32) {
    throw new Error(
      "Falta E2E_SETUP_TOKEN (o SETUP_TOKEN) con al menos 32 caracteres para instalar la cuenta de pruebas.",
    );
  }

  return {
    setupToken,
    userEmail: (process.env.E2E_USER_EMAIL ?? DEFAULT_USER_EMAIL).trim().toLowerCase(),
    userPassword: process.env.E2E_USER_PASSWORD ?? DEFAULT_USER_PASSWORD,
  };
}

interface TableRow {
  tablename: string;
}

/** Vacía todas las tablas de la aplicación sin tocar el historial de migraciones. */
export async function truncateAllTables(): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    throw new Error(
      "No se ha encontrado ninguna tabla. Ejecuta `pnpm db:migrate` antes de las pruebas.",
    );
  }

  const quoted = tables.map((table) => `"${table.tablename}"`).join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

  process.stdout.write(`[e2e] Tablas vaciadas: ${tables.length}\n`);
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";

  assertDisposableDatabase(databaseUrl);

  process.stdout.write(`[e2e] Preparando la base «${databaseName(databaseUrl)}»…\n`);

  try {
    await truncateAllTables();
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write("[e2e] Base preparada. Las pruebas pueden empezar.\n");
}
