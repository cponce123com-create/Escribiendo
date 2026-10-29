/**
 * Envoltura de la CLI de Prisma para el monorepo.
 *
 * Prisma busca los archivos `.env` en el directorio de trabajo actual. La CLI
 * vive en `packages/database`, de modo que ejecutarla desde allí no encuentra
 * el `.env` de la raíz del repositorio, que es donde se documentan
 * `DATABASE_URL` y `DIRECT_URL`. Este envoltorio fija el directorio de trabajo
 * en la raíz y el esquema en `packages/database/prisma/schema.prisma`.
 *
 * El entorno ya definido por la plataforma (Render, CI) tiene prioridad: el
 * archivo `.env` solo rellena las variables que falten.
 *
 * Uso:
 *   pnpm db:generate
 *   pnpm db:validate
 *   pnpm db:migrate
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { repoRoot, runPrisma } from "./lib/prisma-cli";

loadEnv({ path: path.join(repoRoot, ".env"), quiet: true });

const args = process.argv.slice(2);

// `validate` y `format` no abren conexión, pero el esquema declara
// `directUrl = env("DIRECT_URL")` y Prisma exige que la variable exista.
// Se usa una URL ficticia solo para validar; nunca se conecta.
if (args[0] === "validate" || args[0] === "format") {
  process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/escribiendo";
  process.env.DIRECT_URL ??= process.env.DATABASE_URL;
}

if (args.length === 0) {
  process.stderr.write("Uso: tsx scripts/prisma.ts <comando de prisma> [argumentos]\n");
  process.exit(1);
}

runPrisma({ args, retries: 3 })
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  });
