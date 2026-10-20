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
  /**
   * Intentos cuando el fallo parece un bloqueo de archivo de Windows
   * (EPERM/EBUSY). La CLI de Prisma renombra el motor de base de datos sobre
   * el anterior, y un antivirus o un proceso que lo mantiene cargado
   * provoca un fallo temporal.
   */
  retries?: number;
}

function isFileLockError(output: string): boolean {
  return /EPERM|EBUSY|resource busy or locked|being used by another process/iu.test(output);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Ejecuta la CLI de Prisma con el directorio de trabajo en la raíz del
 * repositorio, de modo que la CLI encuentre el archivo `.env` raíz.
 */
export async function runPrisma(options: RunPrismaOptions): Promise<number> {
  const cli = resolvePrismaCli();
  const args = [...options.args];

  if (options.withSchema !== false) {
    args.push("--schema", schemaPath);
  }

  const attempts = Math.max(1, (options.retries ?? 0) + 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await execute(cli, args, options);

    if (result.code === 0) {
      return 0;
    }

    if (attempt < attempts && isFileLockError(result.output)) {
      process.stderr.write(
        `[prisma] El archivo del motor está bloqueado (intento ${attempt} de ${attempts}). Se reintenta…\n`,
      );
      await wait(1_500);
      continue;
    }

    if (options.capture && result.code !== 0) {
      throw new Error(`La CLI de Prisma falló (código ${result.code}):\n${result.output}`);
    }

    return result.code;
  }

  return 1;
}

interface ExecutionResult {
  code: number;
  output: string;
}

function execute(cli: string, args: string[], options: RunPrismaOptions): Promise<ExecutionResult> {
  return new Promise((resolve) => {
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

    child.on("error", () => {
      resolve({ code: 1, output: `${output}\nNo se ha podido ejecutar la CLI de Prisma.` });
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        resolve({ code: 1, output: `${output}\nLa CLI de Prisma terminó con la señal ${signal}.` });
        return;
      }

      resolve({ code: code ?? 1, output });
    });
  });
}
