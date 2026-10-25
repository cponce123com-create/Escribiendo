import { expect, test } from "@playwright/test";
test("personajes: nombre y apellido verificados entre capítulos sin falsos positivos por mayúsculas", async ({
  page,
}, info) => {
  const title = `Personajes verificados ${Date.now()}-${info.retry}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora de pruebas");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const bookId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByLabel("Título de la sección").fill("Presentación");
  await page.getByLabel("Tipo", { exact: true }).selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await page
    .locator(".ProseMirror")
    .fill(
      "Andrés Salazar llegó. La Noche cayó. La Noche volvió. Banco Central creció. Banco Central avanzó.",
    );
  await page.getByRole("button", { name: "Guardar manuscrito", exact: true }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  await page.goto(`/books/${bookId}`);
  await page.getByLabel("Título de la sección").fill("Regreso");
  await page.getByLabel("Tipo", { exact: true }).selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await page
    .locator(".ProseMirror")
    .fill("—Sí —dijo Andrés. Andrés volvió. La Justicia avanzó. La Justicia prevaleció.");
  await page.getByRole("button", { name: "Guardar manuscrito", exact: true }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  await page.goto(`/characters?book=${bookId}`);
  const panel = page.getByRole("region", { name: "Sugerencias de personajes" });
  await panel.getByRole("button", { name: "Volver a analizar el libro", exact: true }).click();
  await expect(panel.getByText(/Verificación de ida y vuelta completada/)).toBeVisible();
  const card = panel
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Andrés Salazar", exact: true }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Nombre: Andrés · Apellido probable: Salazar");
  await expect(card).toContainText("3 apariciones de ida · 3 comprobadas de vuelta");
  await expect(
    panel.getByRole("heading", { name: /^(Noche|Justicia|Banco Central|Salazar)$/ }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath("personaje-verificado-movil.png"),
    fullPage: true,
  });
  await card.getByRole("button", { name: "Aceptar como ficha nueva", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Andrés Salazar", exact: true, level: 2 }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Andrés Salazar", exact: true, level: 2 }),
  ).toHaveCount(1);
  await panel.getByRole("button", { name: "Volver a analizar el libro", exact: true }).click();
  await expect(panel.getByText(/Verificación de ida y vuelta completada/)).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Andrés Salazar", exact: true })).toHaveCount(0);
});
