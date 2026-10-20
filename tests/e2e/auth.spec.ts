import { expect, type Page, test } from "@playwright/test";
import { readE2EConfig } from "./global-setup";

/**
 * Flujo de acceso completo: instalación, sesión, cuenta y cierre de sesión.
 *
 * Las pruebas se ejecutan en serie porque comparten una única base de datos
 * desechable que el «global setup» deja vacía. El orden importa: la
 * instalación solo es posible si todavía no existe ninguna cuenta.
 *
 * Playwright crea un contexto nuevo en cada prueba, de modo que cada una
 * inicia sesión por su cuenta. La contraseña vigente se mantiene en una
 * variable porque el cambio de contraseña es real y persiste en la base.
 */
test.describe.configure({ mode: "serial" });

const config = readE2EConfig();

let currentPassword = config.userPassword;

/**
 * Envía un formulario y espera a la navegación resultante.
 *
 * Los botones de las Server Actions provocan una navegación: sin esperar a la
 * URL de destino, Playwright reintenta el clic sobre un elemento que ya no
 * existe y la acción se dispara varias veces.
 */
async function submitAndWait(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
  destination: RegExp,
): Promise<void> {
  await Promise.all([page.waitForURL(destination), button.click()]);
}

async function login(
  page: Page,
  email = config.userEmail,
  password = currentPassword,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);

  await submitAndWait(
    page,
    page.getByRole("button", { name: "Entrar en el estudio" }),
    /\/dashboard$/u,
  );
}

test.describe("Acceso privado", () => {
  test("la instalación inicial ofrece el formulario y crea la primera cuenta", async ({ page }) => {
    await page.goto("/setup");

    await expect(page.getByRole("heading", { name: "Crear la primera cuenta" })).toBeVisible();

    await page.getByLabel("Token de instalación").fill(config.setupToken);
    await page.getByLabel("Nombre", { exact: true }).fill("Estudio E2E");
    await page.getByLabel("Correo electrónico").fill(config.userEmail);
    await page.getByLabel("Contraseña", { exact: true }).fill(config.userPassword);
    await page.getByLabel("Repite la contraseña").fill(config.userPassword);

    await submitAndWait(
      page,
      page.getByRole("button", { name: "Crear cuenta y entrar" }),
      /\/dashboard$/u,
    );

    await expect(
      page.getByRole("heading", { name: "El estudio está listo para empezar." }),
    ).toBeVisible();
  });

  test("la sesión emitida es HttpOnly, SameSite=Lax y no filtra el token", async ({ page }) => {
    await login(page);

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name.includes("escribiendo_session"));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(sessionCookie?.path).toBe("/");

    const html = await page.content();
    expect(html).not.toContain(config.setupToken);
  });

  test("la cuenta puede actualizarse y el nombre persiste", async ({ page }) => {
    await login(page);
    await page.goto("/account");

    await expect(page.getByRole("heading", { name: "Mi cuenta" })).toBeVisible();

    await page.getByLabel("Nombre visible").fill("Estudio E2E Editado");
    await page.getByRole("button", { name: "Guardar datos" }).click();

    await expect(page.getByText("Datos de la cuenta actualizados.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nombre visible")).toHaveValue("Estudio E2E Editado");
  });

  test("la contraseña puede cambiarse y la sesión sigue activa", async ({ page }) => {
    const newPassword = "Estudio-E2E-2026-rotada";

    await login(page);
    await page.goto("/account");

    await page.getByLabel("Contraseña actual").fill(currentPassword);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(newPassword);
    await page.getByLabel("Repite la contraseña nueva").fill(newPassword);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();

    await expect(
      page.getByText("Contraseña actualizada. Las demás sesiones se han cerrado."),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/u);

    currentPassword = newPassword;
  });

  test("cerrar sesión invalida el acceso al panel", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");

    await submitAndWait(
      page,
      page.getByRole("button", { name: "Cerrar sesión" }).locator("visible=true"),
      /\/login$/u,
    );

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/u);
  });

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
    await login(page);

    await expect(page).toHaveURL(/\/dashboard$/u);
  });

  test("la instalación queda deshabilitada cuando ya existe una cuenta", async ({ page }) => {
    await page.goto("/setup");

    await expect(page).toHaveURL(/\/login$/u);
  });

  test("con sesión, la firma de Cloudinary informa de que no está configurado", async ({
    page,
  }) => {
    await login(page);

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
