import { expect, type Page, test } from "@playwright/test";
import { E2E_ROTATED_PASSWORD, e2eSession, login } from "./support/session";

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
