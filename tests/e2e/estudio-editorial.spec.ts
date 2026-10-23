import { expect, test } from "@playwright/test";
import { auditar, resume } from "./support/axe";

/** Datos aislados por prueba y reintento: nunca se presupone una biblioteca vacía. */
test("estudio de referencia: búsqueda, paneles, notas, concentración y diseño adaptable", async ({
  page,
}, info) => {
  const title = `Estudio visual ${Date.now()}-${info.retry}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora de pruebas");
  await page.getByRole("button", { name: "Crear libro" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByLabel("Título de la sección").fill("Al borde del abismo");
  await page.getByLabel("Tipo").selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await page.setViewportSize({ width: 1672, height: 941 });
  await expect(page.locator(".editorial-studio")).toBeVisible();
  const manuscript = page.locator(".ProseMirror");
  await manuscript.fill("La tormenta cubría el puente. Andrés miró el río. La tormenta volvía.");
  await page.getByRole("button", { name: "Guardar manuscrito" }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  const original = await manuscript.innerText();
  const search = page.getByRole("textbox", { name: "Buscar en el manuscrito", exact: true });
  await search.fill("tormenta");
  await search.press("Enter");
  await expect(page.locator(".studio-search-result")).toHaveText("1 de 2 en este capítulo");
  await expect(manuscript).toHaveText(original);
  await page.getByRole("tab", { name: "Notas", exact: true }).click();
  await page.getByRole("button", { name: "Añadir", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: "Nueva nota rápida" });
  await dialog.getByLabel("Título de la nota").fill("Desarrollar la atmósfera");
  await dialog.getByLabel("Contenido", { exact: true }).fill("Revisar la descripción del río.");
  await dialog.getByRole("button", { name: "Guardar nota" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Desarrollar la atmósfera" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Desarrollar la atmósfera" })).toBeVisible();
  await page.getByRole("tab", { name: "Detalles" }).click();
  await expect(page.getByRole("heading", { name: "Detalles del capítulo" })).toBeVisible();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(page.getByRole("button", { name: "Aplicar sugerencia" })).toBeDisabled();
  await page.getByRole("button", { name: "Ampliar editor" }).click();
  await expect(page.getByRole("button", { name: "Salir del modo concentración" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ampliar editor" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.screenshot({ path: info.outputPath("estudio-escritorio.png"), fullPage: true });
  const violations = await auditar(page);
  expect(violations.graves, resume(violations.graves, page.url()).join("\n")).toEqual([]);
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(manuscript).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("estudio-movil.png"), fullPage: true });
});
