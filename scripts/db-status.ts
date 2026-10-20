/**
 * Comprueba el estado de la base de datos y de las migraciones.
 *
 * Responde a las dos preguntas que más se repiten al desplegar:
 *
 * 1. ¿Se puede conectar con la base de datos?
 * 2. ¿Está aplicado el esquema y hay migraciones pendientes?
 *
 * No modifica nada: es una comprobación de solo lectura.
 *
 * Uso:
 *   pnpm db:status
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { scrubSecrets } from "../packages/shared/src/redaction";
import { repoRoot } from "./lib/prisma-cli";

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const DIRECT_URL = process.env.DIRECT_URL ?? "";

function fail(message: string): never {
  process.stderr.write(`\n✗ ${message}\n\n`);
  process.exit(1);
}

function ok(message: string): void {
  process.stdout.write(`✓ ${message}\n`);
}

function warn(message: string): void {
  process.stdout.write(`! ${message}\n`);
}

function targetName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//u, "");
  } catch {
    return "(desconocida)";
  }
}

if (!DATABASE_URL) {
  fail("No hay DATABASE_URL en el entorno ni en el .env de la raíz.");
}

ok(`Base de datos configurada: ${targetName(DATABASE_URL)}`);
ok(`URL de migración: ${DIRECT_URL ? targetName(DIRECT_URL) : "(sin definir)"}`);

const { prisma } = await import("../packages/database/src/client");

try {
  await prisma.$queryRaw`SELECT 1`;
  ok("La base de datos responde.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(`No se puede conectar con la base de datos.\n  ${scrubSecrets(message)}`);
}

const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = current_schema()
    AND tablename <> '_prisma_migrations'
`;

if (tables.length === 0) {
  fail(
    "La base de datos está vacía: no hay ninguna tabla de la aplicación.\n" +
      "  Aplica las migraciones con `pnpm db:migrate`.",
  );
}

ok(`Tablas de la aplicación: ${tables.length}`);

const hasUsers = tables.some((table) => table.tablename === "users");

if (!hasUsers) {
  fail(
    "Falta la tabla `users`: el esquema no está aplicado.\n" +
      "  Aplica las migraciones con `pnpm db:migrate`.",
  );
}

const applied = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
  SELECT migration_name, finished_at
  FROM _prisma_migrations
  ORDER BY started_at
`;

const pending = applied.filter((row) => row.finished_at === null);

if (pending.length > 0) {
  fail(
    `Hay migraciones sin terminar: ${pending.map((row) => row.migration_name).join(", ")}.\n` +
      "  Ejecuta `pnpm db:migrate` para completar la instalación.",
  );
}

ok(`Migraciones aplicadas: ${applied.length}`);

const users = await prisma.user.count({ where: { deletedAt: null } });
ok(`Cuentas de usuario: ${users}`);

if (users === 0) {
  warn("No hay ninguna cuenta: la instalación inicial sigue pendiente en /setup.");
}

await prisma.$disconnect();

process.stdout.write("\nEl estado de la base de datos es correcto.\n\n");
