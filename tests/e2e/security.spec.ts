import { expect, test } from "@playwright/test";

/**
 * Comprobaciones de la capa de seguridad: cabeceras, CSP, desindexación,
 * protección de rutas privadas y rechazo de orígenes ajenos.
 *
 * Estas pruebas se ejecutan **sin sesión**: es justo lo que hay que
 * comprobar. La sesión compartida del proyecto se anula de forma explícita.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe("Capa de seguridad", () => {
  test("los endpoints de salud responden con el estado real", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);

    const healthBody = (await health.json()) as { status: string; version: string };
    expect(healthBody.status).toBe("ok");
    expect(healthBody.version).toMatch(/^\d+\.\d+\.\d+$/u);

    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBe(200);

    const readyBody = (await ready.json()) as { checks: { database: string; schema: string } };
    expect(readyBody.checks.database).toBe("ok");
    // El esquema al día: si no lo estuviera, la aplicación se caería al
    // pedir la sesión y el aviso de migración no se vería nunca.
    expect(readyBody.checks.schema).toBe("ok");
  });

  test("la respuesta incluye una CSP con nonce y sin estilos en línea libres", async ({
    request,
  }) => {
    const response = await request.get("/login");
    const csp = response.headers()["content-security-policy"] ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/u);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
  });

  test("se envían las cabeceras de endurecimiento de la respuesta", async ({ request }) => {
    const response = await request.get("/login");

    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
  });

  test("el sitio se declara no indexable y robots.txt bloquea el rastreo", async ({ request }) => {
    const response = await request.get("/login");
    const html = await response.text();

    expect(html).toContain('name="robots" content="noindex, nofollow, nocache"');

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Disallow: /");
  });

  test("una ruta privada sin sesión no muestra contenido privado", async ({ page, request }) => {
    // El HTML se pide sin ejecutar JavaScript: así no depende de que la
    // redirección del cliente llegue antes o después de leer el cuerpo.
    const respuesta = await request.get("/dashboard");
    const html = await respuesta.text();

    // La redirección se resuelve en el cliente porque el shell se emite antes
    // de resolver la sesión. El contenido privado nunca llega al navegador.
    expect(html).not.toContain("Manuscritos recientes");
    expect(html).not.toContain("Actividad reciente");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/u);
  });

  test("la firma de Cloudinary exige sesión", async ({ request, baseURL }) => {
    const response = await request.post("/api/cloudinary/signature", {
      headers: { origin: baseURL ?? "http://127.0.0.1:3100" },
    });

    expect(response.status()).toBe(401);
  });

  test("la firma de Cloudinary rechaza un origen ajeno", async ({ request, baseURL }) => {
    const response = await request.post("/api/cloudinary/signature", {
      headers: { origin: "https://atacante.example" },
      data: {},
    });

    expect(response.status()).toBe(403);
    expect(baseURL).toBeTruthy();
  });
});
