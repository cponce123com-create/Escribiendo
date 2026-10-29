/**
 * Compilación de producción multiplataforma.
 *
 * El script de package.json usaba `NODE_ENV=production pnpm …`, sintaxis de
 * shell Unix que falla en Windows. Este envoltorio fija la variable en el
 * entorno del proceso hijo y ejecuta el binario de Next.js directamente.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps", "web");

const candidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(root, "node_modules", "next", "dist", "bin", "next"),
];

const nextBin = candidates.find((candidate) => existsSync(candidate));

if (!nextBin) {
  console.error("No se encuentra Next.js. Ejecuta `pnpm install` en la raíz del repositorio.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: webDir,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
