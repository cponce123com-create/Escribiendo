import { expect, test } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";
import { E2E_USER_EMAIL } from "./support/session";

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
    await page
      .getByRole("region", { name: "invitar a una persona" })
      .getByLabel("Rol")
      .selectOption("EDITOR");
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

  test("quien no administra el estudio no gestiona el equipo ni exporta la auditoría", async ({
    browser,
  }) => {
    // La persona invitada en la prueba anterior existe y no administra el
    // estudio: entra con su cuenta y comprueba que no puede hacer lo que
    // puede hacer quien administra.
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const otra = await contexto.newPage();

    await otra.goto("/login");
    await otra.getByLabel("Correo electrónico").fill("invitada-b@ejemplo.local");
    await otra.locator('input[name="password"]').fill("Libreria-de-prueba-2026");
    await otra.getByRole("button", { name: "Entrar en el estudio" }).click();

    await expect(otra).toHaveURL(/\/dashboard/u);

    // La página del equipo se ve, pero sin los controles de gestión.
    await otra.goto("/team");
    await expect(otra.getByRole("heading", { name: "Personas con acceso" })).toBeVisible();
    await expect(otra.getByLabel("Correo de la persona")).toHaveCount(0);
    await expect(otra.getByRole("link", { name: /Exportar el registro/ })).toHaveCount(0);

    // Y el servidor rechaza la descarga de la auditoría.
    const auditoria = await otra.request.get("/api/audit/export");

    expect(auditoria.status()).toBe(403);

    await contexto.close();
  });

  test("una persona que pertenece a dos estudios puede cambiar de uno a otro", async ({ page }) => {
    // Se crea un segundo estudio y se añade a la cuenta de pruebas, como si
    // le hubieran invitado.
    const usuario = await prisma.user.findUnique({
      where: { email: E2E_USER_EMAIL },
      select: { id: true },
    });

    expect(usuario).not.toBeNull();

    const estudio = await prisma.workspace.create({
      data: {
        name: "Segundo estudio",
        slug: `segundo-estudio-${Date.now()}`,
        ownerId: usuario!.id,
      },
      select: { id: true, name: true },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: estudio.id,
        userId: usuario!.id,
        role: "AUTHOR",
      },
    });

    await page.goto("/dashboard");

    await page.locator("details.workspace-menu > summary").click();

    // El selector ofrece los dos estudios.
    const selector = page.getByLabel("Cambiar de espacio de trabajo");

    await expect(selector).toBeVisible();
    await expect(selector.locator("option")).toHaveCount(2);

    // La prueba deja la sesión compartida como estaba, para que las pruebas
    // siguientes sigan viendo el estudio original.
    const original = await selector.inputValue();

    await selector.selectOption(estudio.id);
    await page.getByRole("button", { name: "Cambiar de estudio" }).click();

    await expect(page.getByText("Has cambiado de estudio.")).toBeVisible();

    // Y a partir de ahora se trabaja en el estudio nuevo.
    await page.goto("/team");
    await expect(page.getByText(estudio.name).first()).toBeVisible();

    await page.locator("details.workspace-menu > summary").click();

    // Se vuelve al estudio de siempre.
    await selector.selectOption(original);
    await page.getByRole("button", { name: "Cambiar de estudio" }).click();
    await expect(page.getByText("Has cambiado de estudio.")).toBeVisible();
  });
});
