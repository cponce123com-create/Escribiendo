import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";
import { hashToken } from "../../apps/web/src/lib/auth/tokens";
import { E2E_STORAGE_STATE_PATH, E2E_ROTATED_PASSWORD, e2eSession, login } from "./support/session";

/**
 * Flujo de acceso: sesión, cuenta, contraseñas y cierre de sesión.
 *
 * La cuenta de pruebas la crea el proyecto de preparación, que también deja
 * guardada la sesión compartida. Aquí se comprueba el comportamiento del
 * acceso con esa sesión y, en los casos que lo requieren, con un acceso
 * nuevo desde cero.
 */
test.describe.configure({ mode: "serial" });

/**
 * Envía un formulario y espera a la navegación resultante.
 *
 * Los botones de las Server Actions provocan una navegación: sin esperar a
 * la URL de destino, Playwright reintenta el clic sobre un elemento que ya no
 * existe y la acción se dispara varias veces.
 */
async function submitAndWait(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
  destination: RegExp,
): Promise<void> {
  await Promise.all([page.waitForURL(destination), button.click()]);
}

test.describe("Sesión activa", () => {
  test("la sesión emitida es HttpOnly, SameSite=Lax y no filtra el token", async ({ page }) => {
    const cookies = await page.context().cookies();

    const sessionCookie = cookies.find((cookie) => cookie.name.includes("escribiendo_session"));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(sessionCookie?.path).toBe("/");

    const html = await page.content();

    expect(html).not.toContain(e2eSession.password);
  });

  test("la cuenta puede actualizarse y el nombre persiste", async ({ page }) => {
    await page.goto("/account");

    await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();

    await page.getByLabel("Nombre visible").fill("Estudio E2E Editado");
    await page.getByRole("button", { name: "Guardar datos" }).click();

    await expect(page.getByText("Datos de la cuenta actualizados.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nombre visible")).toHaveValue("Estudio E2E Editado");
  });

  test("la contraseña puede cambiarse y la sesión sigue activa", async ({ page }) => {
    await page.goto("/account");

    await page.getByLabel("Contraseña actual").fill(e2eSession.password);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(E2E_ROTATED_PASSWORD);
    await page.getByLabel("Repite la contraseña nueva").fill(E2E_ROTATED_PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();

    await expect(
      page.getByText("Contraseña actualizada. Las demás sesiones se han cerrado."),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/u);

    e2eSession.password = E2E_ROTATED_PASSWORD;
  });

  test("el cambio de contraseña rechaza una contraseña con la identidad de la cuenta", async ({
    page,
  }) => {
    await page.goto("/account");

    // El nombre de la cuenta es «Estudio E2E Editado» en este punto.
    await page.getByLabel("Contraseña actual").fill(e2eSession.password);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("Estudio-E2E-Editado-2026");
    await page.getByLabel("Repite la contraseña nueva").fill("Estudio-E2E-Editado-2026");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();

    await expect(
      page.getByText("La contraseña no debe contener tu nombre ni tu correo electrónico.").first(),
    ).toBeVisible();

    // La contraseña anterior sigue siendo la válida: el cambio se rechazó.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/u);
  });

  test("con sesión, la firma de Cloudinary informa de que no está configurado", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const response = await page.request.post("/api/cloudinary/signature", {
      headers: { origin: new URL(page.url()).origin },
    });

    // Sin credenciales de Cloudinary la ruta responde 503 de forma explícita:
    // no hay modo de demostración ni firmas con valores inventados.
    expect(response.status()).toBe(503);

    const body = (await response.json()) as { error?: string };
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("apiSecret");
  });
});

test.describe("Recuperación de contraseña", () => {
  // Estas pruebas necesitan el formulario de recuperación, que solo aparece
  // sin sesión: la compartida se anula de forma explícita.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("un enlace de un solo uso permite cambiar la contraseña", async ({ browser }) => {
    // 1. La administración invita a una persona y esta acepta la invitación.
    const administracion = await browser.newContext({ storageState: E2E_STORAGE_STATE_PATH });
    const paginaAdmin = await administracion.newPage();

    await paginaAdmin.goto("/team");
    await paginaAdmin.getByLabel("Correo de la persona").fill("recuperacion@ejemplo.local");
    await paginaAdmin.getByRole("button", { name: "Crear invitación" }).click();

    const enlace = (await paginaAdmin.locator("code").first().innerText()).trim();

    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const persona = await contexto.newPage();

    await persona.goto(enlace);
    await persona.getByLabel("Tu nombre").fill("Recuperación Prueba");
    await persona.getByLabel("Elige una contraseña").fill("Contraseña-Inicial-2026");
    await persona.getByRole("button", { name: "Crear cuenta y entrar" }).click();

    await expect(persona).toHaveURL(/\/team$/u);

    // 2. La administración emite el enlace de recuperación. En la prueba se
    //    crea el token con la misma huella que guarda la aplicación, porque el
    //    script de la CLI escribe en la base de datos real.
    const token = "enlace-de-recuperacion-de-prueba-0123456789abc";
    const usuario = await prisma.user.findUnique({
      where: { email: "recuperacion@ejemplo.local" },
      select: { id: true },
    });

    expect(usuario).not.toBeNull();

    await prisma.passwordResetToken.create({
      data: {
        userId: usuario!.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });

    // 3. Con el enlace, la persona elige una contraseña nueva.
    await persona.goto(`/reset-password?token=${token}`);

    await expect(
      persona.getByRole("heading", { name: "Elige una contraseña nueva" }),
    ).toBeVisible();

    await persona.getByLabel("Contraseña nueva", { exact: true }).fill("Contraseña-Nueva-2026");
    await persona.getByLabel("Repite la contraseña nueva").fill("Contraseña-Nueva-2026");
    await persona.getByRole("button", { name: /Guardar contraseña/ }).click();

    // Al guardar, la persona vuelve al acceso con un aviso claro.
    await expect(persona).toHaveURL(/\/login\?reset=1$/u);
    await expect(
      persona.getByText("Contraseña restablecida. Ya puedes entrar con tus credenciales nuevas."),
    ).toBeVisible();

    // 4. El enlace es de un solo uso: al volver a él, ya no vale.
    await persona.goto(`/reset-password?token=${token}`);

    await expect(persona.getByRole("heading", { name: "Este enlace no es válido" })).toBeVisible();

    // 5. Y con la contraseña nueva se puede entrar.
    await persona.goto("/login");
    await persona.getByLabel("Correo electrónico").fill("recuperacion@ejemplo.local");
    await persona.getByLabel("Contraseña", { exact: true }).fill("Contraseña-Nueva-2026");
    await submitAndWait(
      persona,
      persona.getByRole("button", { name: "Entrar en el estudio" }),
      /\/dashboard$/u,
    );

    await contexto.close();
    await administracion.close();
  });
});

test.describe("Acceso desde cero", () => {
  // Estas pruebas necesitan el formulario de acceso, que solo aparece sin
  // sesión: la compartida se anula de forma explícita.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("el acceso con credenciales incorrectas no revela si la cuenta existe", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Correo electrónico").fill("nadie@ejemplo.local");
    await page.getByLabel("Contraseña", { exact: true }).fill("Contraseña-Equivocada-1");
    await page.getByRole("button", { name: "Entrar en el estudio" }).click();

    // Next.js añade un «route announcer» con role="alert": se filtra por texto.
    const alert = page.getByRole("alert").filter({ hasText: /correo o la contraseña/iu });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/correo o la contraseña no son correctos/i);
    await expect(page).toHaveURL(/\/login$/u);
  });

  test("el acceso con la contraseña nueva funciona", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Correo electrónico").fill(e2eSession.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(e2eSession.password);

    await submitAndWait(
      page,
      page.getByRole("button", { name: "Entrar en el estudio" }),
      /\/dashboard$/u,
    );
  });

  test("la instalación queda deshabilitada cuando ya existe una cuenta", async ({ page }) => {
    await page.goto("/setup");

    await expect(page).toHaveURL(/\/login$/u);
  });

  test("cerrar sesión invalida el acceso al panel", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Cerrar sesión" }).locator("visible=true").click();

    await expect(page).toHaveURL(/\/login$/u);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/u);
  });
});
