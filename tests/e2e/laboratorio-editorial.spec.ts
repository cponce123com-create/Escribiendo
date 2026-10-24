import { expect, test } from "@playwright/test";

/** Requiere PostgreSQL E2E aislado; no ejecutar el setup sobre producción. */
test("laboratorio: navegación y análisis de un capítulo sin alterar el manuscrito", async ({
  page,
}, info) => {
  const title = `Laboratorio ${Date.now()}-${info.retry}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora de pruebas");
  await page.getByRole("button", { name: "Crear libro" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByLabel("Título de la sección").fill("La casa del río");
  await page.getByLabel("Tipo").selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  const text = "María decidió subir arriba. Entonces vio la casa. Entonces comprendió lo sucedido.";
  await editor.fill(text);
  await page.getByRole("button", { name: "Guardar manuscrito" }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  const sectionUrl = page.url();
  await page.getByRole("link", { name: "Laboratorio Editorial →" }).click();
  await expect(
    page.getByRole("heading", { name: "Laboratorio Editorial", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Categorías del Laboratorio Editorial" })
      .locator("article"),
  ).toHaveCount(10);
  await page.getByRole("link", { name: "Elegir capítulo y reglas" }).click();
  await page
    .getByLabel("Texto que quieres analizar")
    .selectOption({ label: "La casa del río (incluye subsecciones)" });
  await page.getByRole("button", { name: "Analizar selección" }).click();
  await expect(page).toHaveURL(/section=/);
  await page.getByText("Configurar reglas de estilo", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Omitir redundancias conocidas" }).check();
  await page.getByRole("button", { name: "Analizar selección" }).click();
  await expect(page).toHaveURL(/disableRule=es.style.known-redundancies/);
  await page.goto(sectionUrl);
  await expect(editor).toHaveText(text);
});
