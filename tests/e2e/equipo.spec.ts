import { expect, test } from "@playwright/test";

/**
 * Equipo y gobernanza: invitaciones, roles, bajas, asignación de trabajo y
 * exportación de la auditoría.
 */
test.describe.configure({ mode: "serial" });

test.describe("Equipo", () => {
  test("la página del equipo muestra a las personas del estudio", async ({ page }) => {
    await page.goto("/team");

    await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Personas con acceso" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "miembros del estudio" }).getByText(/e2e@ejemplo.local/),
    ).toBeVisible();
  });

  test("se crea una invitación y se muestra su enlace una sola vez", async ({ page }) => {
    await page.goto("/team");

    await page.getByLabel("Correo de la persona").fill("invitada-2@ejemplo.local");
    await page.getByLabel("Rol").selectOption("EDITOR");
    await page.getByRole("button", { name: "Crear invitación" }).click();

    await expect(page.getByText(/Invitación para invitada-2@ejemplo.local/)).toBeVisible();

    const codigo = await page.locator("code").first().innerText();

    expect(codigo).toContain("/invitacion/");
  });

  test("la persona invitada crea su cuenta y entra al estudio", async ({ page, browser }) => {
    await page.goto("/team");
    await page.getByLabel("Correo de la persona").fill("invitada-b@ejemplo.local");
    await page.getByRole("button", { name: "Crear invitación" }).click();

    const codigo = await page.locator("code").first().innerText();
    const enlace = codigo.trim();

    // Una ventana nueva es otra persona: sin sesión y con otra cuenta.
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const otra = await contexto.newPage();

    await otra.goto(enlace);

    await expect(otra.getByRole("heading", { name: /Te han invitado a/ })).toBeVisible();
    await expect(otra.getByText("invitada-b@ejemplo.local")).toBeVisible();

    await otra.getByLabel("Tu nombre").fill("Invitada Prueba");
    await otra.getByLabel("Elige una contraseña").fill("Libreria-de-prueba-2026");
    await otra.getByRole("button", { name: "Crear cuenta y entrar" }).click();

    await expect(otra).toHaveURL(/\/team$/u);
    await expect(otra.getByRole("heading", { name: "Personas con acceso" })).toBeVisible();
    await expect(
      otra.getByRole("region", { name: "miembros del estudio" }).getByText("Invitada Prueba"),
    ).toBeVisible();

    await contexto.close();
  });

  test("la persona invitada ya no puede usar la misma invitación", async ({ page, browser }) => {
    await page.goto("/team");
    await page.getByLabel("Correo de la persona").fill("reuso-2@ejemplo.local");
    await page.getByRole("button", { name: "Crear invitación" }).click();

    const enlace = (await page.locator("code").first().innerText()).trim();

    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const otra = await contexto.newPage();

    await otra.goto(enlace);
    await otra.getByLabel("Tu nombre").fill("Reuso Prueba");
    await otra.getByLabel("Elige una contraseña").fill("Libreria-de-prueba-2026");
    await otra.getByRole("button", { name: "Crear cuenta y entrar" }).click();

    await expect(otra).toHaveURL(/\/team$/u);

    // Un segundo intento con la misma invitación debe rechazarse.
    await otra.goto(enlace);
    await expect(otra.getByText(/Invitación ya utilizada|Invitación no válida/)).toBeVisible();

    await contexto.close();
  });

  test("el registro de auditoría se puede exportar", async ({ page }) => {
    await page.goto("/team");

    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Exportar el registro/ }).click(),
    ]);

    expect(descarga.suggestedFilename()).toBe("auditoria.csv");

    const ruta = await descarga.path();

    if (!ruta) {
      throw new Error("No se ha descargado el registro.");
    }

    const { readFileSync } = await import("node:fs");
    const contenido = readFileSync(ruta, "utf8");

    expect(contenido).toContain("fecha,accion,tipo");
    expect(contenido).toContain("TEAM_INVITATION_CREATED");
  });
});
