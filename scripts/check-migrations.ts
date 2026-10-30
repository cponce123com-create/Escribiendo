/**
 * Guarda de migraciones destructivas.
 *
 * `render.yaml` aplica `prisma migrate deploy` en cada build. Una migración
 * con `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` o un cambio de tipo puede
 * destruir datos sin revisión. Esta comprobación detiene el build y enumera
 * las sentencias encontradas.
 *
 * Para una migración destructiva deliberada, revisa el SQL y ejecuta el
 * despliegue con `ALLOW_DESTRUCTIVE_MIGRATIONS=1` (o aplica la migración de
 * forma manual, como indica docs/DEPLOYMENT.md).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { registerVarcharColumns, acceptVarcharExpansion } from "./lib/migration-safety";

const migrationsDir = path.resolve("packages/database/prisma/migrations");

const DESTRUCTIVE =
  /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)|TRUNCATE|ALTER\s+COLUMN[^;]*\bTYPE\b|DELETE\s+FROM)\b/iu;

const allow = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "1";

let failed = false;
const varcharLimits = new Map<string, number>();

for (const entry of readdirSync(migrationsDir, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) {
    continue;
  }

  const file = path.join(migrationsDir, entry.name, "migration.sql");

  let sql: string;

  try {
    sql = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  registerVarcharColumns(sql, varcharLimits);

  for (const [index, line] of sql.split(/\r?\n/u).entries()) {
    if (acceptVarcharExpansion(line, varcharLimits)) continue;
    if (!DESTRUCTIVE.test(line)) {
      continue;
    }

    failed = true;
    const relative = path.relative(process.cwd(), file);
    process.stderr.write(`${relative}:${index + 1}: ${line.trim()}\n`);
  }
}

if (failed && !allow) {
  process.stderr.write(
    "\nMigración destructiva detectada. Revisa el SQL; para aplicarla de forma " +
      "deliberada ejecuta con ALLOW_DESTRUCTIVE_MIGRATIONS=1.\n",
  );
  process.exit(1);
}

if (failed) {
  process.stderr.write(
    "Migración destructiva detectada y autorizada con ALLOW_DESTRUCTIVE_MIGRATIONS=1.\n",
  );
}

process.stdout.write("Migraciones sin operaciones destructivas.\n");
