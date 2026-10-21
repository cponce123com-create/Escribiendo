import { expect, test } from "@playwright/test";
import { auditar, resume } from "./support/axe";

/**
 * Accesibilidad de las páginas que existen sin un libro.
 *
 * El editor y la vista previa se auditan en `manuscrito.spec.ts`, que ya crea
 * un libro: aquí no se crea ninguno para no depender del orden de las
 * pruebas.
 */

test.describe("Accesibilidad", () => {
  test("no hay infracciones graves en las páginas principales", async ({ page }) => {
    const rutas = [
      "/login",
      "/dashboard",
      "/books",
      "/books/new",
      "/notes",
      "/stats",
      "/team",
      "/account",
    ];

    const graves: string[] = [];
    const avisos: string[] = [];

    for (const ruta of rutas) {
      // La página tiene que estar quieta: si navega mientras axe corre, el
      // contexto de ejecución desaparece.
      await page.goto(ruta, { waitUntil: "networkidle" });
      const resultado = await auditar(page);

      graves.push(...resume(resultado.graves, ruta));
      avisos.push(...resume(resultado.avisos, ruta));
    }

    if (avisos.length > 0) {
      test.info().annotations.push({
        type: "note",
        description: `Avisos de accesibilidad: ${avisos.join(" | ")}`,
      });

      process.stdout.write(`[accesibilidad] avisos: ${avisos.join(" | ")}\n`);
    }

    expect(graves).toEqual([]);
  });
});
