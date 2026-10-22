import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const composeFile = "compose.e2e.yaml";
const databaseUrl = "postgresql://escribiendo:escribiendo_e2e@127.0.0.1:55432/escribiendo_test";
const setupToken = randomBytes(32).toString("base64url");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} terminó con ${signal ?? `código ${code ?? "desconocido"}`}.`));
    });
  });
}

async function main(): Promise<void> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    E2E_SETUP_TOKEN: setupToken,
    SETUP_TOKEN: setupToken,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  let composeAttempted = false;

  try {
    composeAttempted = true;
    await run(
      "docker",
      ["compose", "-p", "escribiendo-e2e", "-f", composeFile, "up", "-d", "--wait"],
      env,
    );

    await run(pnpm, ["db:generate"], env);
    await run(pnpm, ["db:migrate"], env);
    await run(pnpm, ["build"], env);
    await run(pnpm, ["exec", "playwright", "test", "--reporter=line"], env);
  } catch (error) {
    console.error(
      "No se pudieron ejecutar las pruebas E2E. Instala Docker Desktop o Docker Engine y vuelve a intentarlo.",
    );
    throw error;
  } finally {
    if (composeAttempted) {
      try {
        await run(
          "docker",
          [
            "compose",
            "-p",
            "escribiendo-e2e",
            "-f",
            composeFile,
            "down",
            "--volumes",
            "--remove-orphans",
          ],
          env,
        );
      } catch {
        console.error(
          "No se pudo detener automáticamente la base temporal; revisa Docker Compose.",
        );
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Error desconocido al ejecutar Playwright.",
  );
  process.exitCode = 1;
});
