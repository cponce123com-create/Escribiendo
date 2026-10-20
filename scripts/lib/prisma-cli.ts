import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio, calculada desde la ubicación de este archivo. */
export const repoRoot = path.resolve(scriptDir, "..", "..");

/** Paquete que contiene el esquema Prisma y el cliente generado. */
export const databaseDir = path.join(repoRoot, "packages", "database");

/** Ruta absoluta del esquema Prisma. */
export const schemaPath = path.join(databaseDir, "prisma", "schema.prisma");

/**
 * Localiza el ejecutable de la CLI de Prisma a partir del campo `bin` de su
 * manifiesto, en lugar de fijar una ruta interna del paquete.
 */
export function resolvePrismaCli(): string {
  const packageDir = path.join(databaseDir, "node_modules", "prisma");
  const manifestPath = path.join(packageDir, "package.json");

  if (!existsSync(manifestPath)) {
    throw new Error(
      "No se encuentra la CLI de Prisma. Ejecuta `pnpm install` en la raíz del repositorio.",
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.prisma;

  if (!bin) {
    throw new Error("El paquete `prisma` no declara un ejecutable llamado `prisma`.");
  }

  return path.join(packageDir, bin);
}

export interface RunPrismaOptions {
  /** Argumentos adicionales (por ejemplo, `["migrate", "deploy"]`). */
  args: string[];
  /** Si es falso, no se añade `--schema`. */
  withSchema?: boolean;
  /** Directorio de trabajo. Por defecto, la raíz del repositorio. */
  cwd?: string;
  /** Si es falso, la salida se hereda de la consola en lugar de capturarse. */
  capture?: boolean;
}

/**
 * Ejecuta la CLI de Prisma con el directorio de trabajo en la raíz del
 * repositorio, de modo que la CLI encuentre el archivo `.env` raíz.
 */
export function runPrisma(options: RunPrismaOptions): Promise<number> {
  const cli = resolvePrismaCli();
  const args = [...options.args];

  if (options.withSchema !== false) {
    args.push("--schema", schemaPath);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: options.cwd ?? repoRoot,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });

    let output = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    child.on("error", reject);

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`La CLI de Prisma terminó con la señal ${signal}.`));
        return;
      }

      if (code !== 0 && options.capture) {
        reject(new Error(`La CLI de Prisma falló (código ${code}):\n${output}`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}
