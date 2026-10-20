import { expect, test as setup } from "@playwright/test";
import { createAccount, login, E2E_STORAGE_STATE_PATH } from "./support/session";

/**
 * Preparación de la cuenta de pruebas.
 *
 * Se ejecuta como proyecto propio antes que el resto. Crea la cuenta mediante
 * la ruta de instalación (que solo funciona mientras no exista ninguna) y
 * guarda la sesión en disco para que el resto de pruebas la reutilice.
 *
 * Abrir una sesión por prueba es más lento y consume el presupuesto de
 * intentos de acceso por dirección, que existe para detener la fuerza bruta y
 * no el uso legítimo.
 */
setup("crea la cuenta de pruebas y guarda la sesión", async ({ page }) => {
  await page.goto("/setup");

  const heading = page.getByRole("heading", { name: "Crear la primera cuenta" });
  const disabled = page.getByRole("heading", { name: "Instalación deshabilitada" });

  if (await disabled.isVisible().catch(() => false)) {
    // Ya existe una cuenta: la instalación está cerrada y hay que acceder.
    await page.goto("/login");
    await login(page);
  } else {
    await expect(heading).toBeVisible();
    // La creación de la cuenta ya deja la sesión iniciada.
    await createAccount(page);
  }

  await page.context().storageState({ path: E2E_STORAGE_STATE_PATH });
});
