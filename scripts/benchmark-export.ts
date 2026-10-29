/** Perfil de solo texto del mismo banco de esfuerzo, en procesos aislados. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    fileURLToPath(new URL("./stress-export.ts", import.meta.url)),
    "--profile=text",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
