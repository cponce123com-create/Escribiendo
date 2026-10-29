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
  await page.getByLabel("Título de la sección").fill("PRÓLOGO — La última vez que escuché su voz");
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
  const search = page.getByRole("textbox", { name: "Buscar en el capítulo actual", exact: true });
  await search.fill("tormenta");
  await expect(manuscript.locator(".manuscript-search-match")).toHaveCount(2);
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
  await page.getByRole("tab", { name: "Notas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Desarrollar la atmósfera" })).toBeVisible();
  await page.getByRole("tab", { name: "Detalles" }).click();
  await expect(page.getByRole("heading", { name: "Detalles del capítulo" })).toBeVisible();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisiones", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buscar en el libro" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Buscar", exact: true }).click();
  await page.getByRole("searchbox", { name: "Palabra o frase", exact: true }).fill("tormenta");
  await expect(page.getByRole("button", { name: "Reemplazar todo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Reemplazar todo", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Reemplazar en todo el libro" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(manuscript).toHaveText(original);
  await page.getByRole("searchbox", { name: "Palabra o frase", exact: true }).fill("");
  const sidebarTitle = page.locator(".studio-manuscript-nav h2");
  expect(await sidebarTitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect((await page.locator(".studio-chapter-hero").boundingBox())!.height).toBeLessThan(240);
  expect((await page.locator(".studio-writing-column").boundingBox())!.width).toBeGreaterThan(700);
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
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(manuscript).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const mobilePanels = page.getByRole("navigation", { name: "Paneles del editor", exact: true });
  await expect(
    mobilePanels.getByRole("button", { name: "Capítulos", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#studio-manuscript-navigation")).toBeHidden();
  await expect(page.locator("#studio-editorial-panel")).toBeHidden();
  expect((await manuscript.boundingBox())!.y).toBeLessThan(820);
  await mobilePanels.getByRole("button", { name: "Capítulos", exact: true }).click();
  await expect(page.locator("#studio-manuscript-navigation")).toBeVisible();
  await mobilePanels.getByRole("button", { name: "Capítulos", exact: true }).click();
  await mobilePanels.getByRole("button", { name: "Herramientas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Buscar en el libro", exact: true }),
  ).toBeVisible();
  await mobilePanels.getByRole("button", { name: "Herramientas", exact: true }).click();
  await expect(page.locator("#studio-editorial-panel")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: info.outputPath("estudio-movil.png"), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  const mobileViolations = await auditar(page);
  expect(mobileViolations.graves, resume(mobileViolations.graves, page.url()).join("\n")).toEqual(
    [],
  );
  await page.screenshot({ path: info.outputPath("estudio-movil-oscuro.png"), fullPage: true });
});
