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

interface ConnectionTarget {
  host: string;
  database: string;
  user: string;
  search: URLSearchParams;
}

function parseTarget(url: string): ConnectionTarget | null {
  try {
    const parsed = new URL(url);

    return {
      // El host del pooler de Neon lleva el sufijo «-pooler». Se elimina
      // para comparar el endpoint real, que es el mismo en ambas URLs.
      host: parsed.hostname.replace(/-pooler(?=\.|$)/u, ""),
      database: parsed.pathname.replace(/^\//u, ""),
      user: parsed.username,
      search: parsed.searchParams,
    };
  } catch {
    return null;
  }
}

function targetName(url: string): string {
  const target = parseTarget(url);

  if (!target) {
    return "(desconocida)";
  }

  return `${target.host}/${target.database}`;
}

/**
 * Comprueba que `DATABASE_URL` y `DIRECT_URL` apunten al mismo sitio.
 *
 * En Neon, el host incluye el identificador del endpoint, que codifica
 * proyecto, rama y región. Si las dos URLs no coinciden, la migración se
 * aplicaría a una base de datos distinta de la que usa la aplicación, y el
 * síntoma sería exactamente «the table public.users does not exist».
 */
function checkUrlsAreConsistent(): void {
  if (!DIRECT_URL) {
    warn("DIRECT_URL no está definida: las migraciones usarán DATABASE_URL.");
    return;
  }

  const app = parseTarget(DATABASE_URL);
  const direct = parseTarget(DIRECT_URL);

  if (!app || !direct) {
    fail("DATABASE_URL o DIRECT_URL no son URLs de PostgreSQL válidas.");
  }

  if (app.host !== direct.host) {
    fail(
      "DATABASE_URL y DIRECT_URL apuntan a hosts distintos.\n" +
        `  DATABASE_URL → ${app.host}\n` +
        `  DIRECT_URL   → ${direct.host}\n` +
        "  Deben ser el mismo proyecto, la misma rama y la misma región de Neon.",
    );
  }

  if (app.database !== direct.database) {
    fail(
      "DATABASE_URL y DIRECT_URL apuntan a bases de datos distintas.\n" +
        `  DATABASE_URL → ${app.database}\n` +
        `  DIRECT_URL   → ${direct.database}`,
    );
  }

  if (app.user !== direct.user) {
    warn(
      `DATABASE_URL y DIRECT_URL usan usuarios distintos (${app.user} y ${direct.user}). Comprueba que ambos son válidos.`,
    );
  }

  ok("DATABASE_URL y DIRECT_URL apuntan al mismo endpoint de Neon.");

  if (direct.search.get("pgbouncer") === "true") {
    warn("DIRECT_URL incluye pgbouncer=true: la conexión directa no debe usar el pooler.");
  }

  for (const [name, target] of [
    ["DATABASE_URL", app],
    ["DIRECT_URL", direct],
  ] as const) {
    if (target.search.get("sslmode") !== "require") {
      warn(`${name} no incluye sslmode=require. En Neon el TLS es obligatorio.`);
    }
  }
}

if (!DATABASE_URL) {
  fail("No hay DATABASE_URL en el entorno ni en el .env de la raíz.");
}

ok(`Base de datos configurada: ${targetName(DATABASE_URL)}`);
ok(`URL de migración: ${DIRECT_URL ? targetName(DIRECT_URL) : "(sin definir)"}`);

checkUrlsAreConsistent();

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

// Tamaño de las tablas: las revisiones y la auditoría crecen con el uso y son
// las que pueden llenar el almacenamiento del plan gratuito.
const sizes = await prisma.$queryRaw<{ tabla: string; bytes: bigint }[]>`
  SELECT relname AS tabla, pg_total_relation_size(c.oid) AS bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = current_schema()
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 8
`;

if (sizes.length > 0) {
  const lineas = sizes.map(
    (fila) => `  ${fila.tabla.padEnd(28)} ${(Number(fila.bytes) / 1024 / 1024).toFixed(1)} MB`,
  );

  process.stdout.write(`Tablas más grandes:\n${lineas.join("\n")}\n`);
}

// Índices parciales que solo existen en las migraciones: si una migración
// futura los recompone, se perderían en silencio.
const indices = await prisma.$queryRaw<{ indexname: string }[]>`
  SELECT indexname
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND indexname IN (
      'book_editions_one_default_per_book_key',
      'layout_profiles_one_default_per_workspace_key',
      'editorial_templates_system_slug_key'
    )
`;

if (indices.length < 3) {
  warn(
    "Faltan índices parciales de unicidad (edición predeterminada, perfil " +
      "predeterminado y plantilla de sistema). Revisa las migraciones.",
  );
} else {
  ok(`Índices parciales de unicidad: ${indices.length}`);
}

await prisma.$disconnect();

process.stdout.write("\nEl estado de la base de datos es correcto.\n\n");
