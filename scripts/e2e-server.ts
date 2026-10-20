/**
 * Servidor para las pruebas de extremo a extremo.
 *
 * Sirve la aplicación como en producción, pero con `NODE_ENV=test` para que la
 * cookie de sesión no lleve `Secure` (las pruebas usan http://127.0.0.1 y el
 * navegador descartaría una cookie segura sobre texto plano).
 *
 * Ejecutar las pruebas contra la compilación de producción evita dos
 * problemas del servidor de desarrollo: el recarga continua cuando la CSP
 * bloquea los estilos en línea de las herramientas de Next.js, y el
 * «fast refresh» que vuelve a renderizar los componentes mientras una
 * prueba los está usando. Además, comprueba la política de seguridad real.
 *
 * La compilación se ejecuta aparte (`pnpm test:e2e` la lanza antes), porque
 * el motor de Prisma no se puede reemplazar en Windows si hay un proceso
 * que lo mantiene cargado.
 */
import { spawn } from "node:child_process";
import { repoRoot } from "./lib/prisma-cli";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      env,
      shell: process.platform === "win32",
    });

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`«${command} ${args.join(" ")}» terminó con el código ${code ?? "?"}.`));
    });
  });
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

process.stdout.write("[e2e] Arrancando el servidor de producción para las pruebas…\n");
await run(pnpm, ["--filter", "@escribiendo/web", "start"], {
  ...process.env,
  NODE_ENV: "test",
  // La suite abre muchas sesiones desde la misma dirección. El límite de
  // intentos por IP es un control de seguridad contra la fuerza bruta, no
  // contra el uso legítimo: aquí se amplía solo para el servidor de pruebas.
  RATE_LIMIT_LOGIN_ATTEMPTS: "500",
});
