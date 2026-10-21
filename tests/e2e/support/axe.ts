import type { Page } from "@playwright/test";
import { createRequire } from "node:module";

/**
 * Auditoría de accesibilidad con axe-core.
 *
 * El archivo comprueba lo que un lector de pantalla necesita: nombres
 * accesibles, contraste, roles y estados. No sustituye a una revisión manual,
 * pero evita que un error de marcado se cuele sin avisar.
 *
 * Solo se consideran graves las infracciones `serious` y `critical`: son las
 * que impiden usar la aplicación. Los avisos se anotan y no rompen la suite.
 */

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

export interface Infraccion {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
}

export interface ResultadoAccesibilidad {
  graves: Infraccion[];
  avisos: Infraccion[];
}

/** Pasa axe por la página y separa las infracciones graves de los avisos. */
export async function auditar(page: Page): Promise<ResultadoAccesibilidad> {
  await page.addScriptTag({ path: axePath });

  const violaciones = await page.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: {
          run: (context: unknown, options: unknown) => Promise<{ violations: unknown[] }>;
        };
      }
    ).axe;

    const resultado = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    });

    return resultado.violations as Array<{
      id: string;
      impact: string | null;
      help: string;
      nodes: Array<{ target: string[] }>;
    }>;
  });

  return {
    graves: violaciones.filter(
      (violacion) => violacion.impact === "serious" || violacion.impact === "critical",
    ),
    avisos: violaciones.filter(
      (violacion) => violacion.impact !== "serious" && violacion.impact !== "critical",
    ),
  };
}

/** Resume las infracciones en una línea por cada una. */
export function resume(infracciones: Infraccion[], ruta: string): string[] {
  return infracciones.map(
    (violacion) =>
      `${ruta}: ${violacion.id} (${violacion.impact}) — ${violacion.help} · ${violacion.nodes
        .map((nodo) => nodo.target.join(" "))
        .join(", ")}`,
  );
}
