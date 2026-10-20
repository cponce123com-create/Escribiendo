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
