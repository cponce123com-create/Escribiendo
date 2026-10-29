import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
  await page.getByRole("link", { name: "Laboratorio editorial", exact: true }).click();
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

test("laboratorio: revisión entre navegadores, fechas, etapas y resumen persistentes", async ({
  page,
  browser,
}, info) => {
  const title = `Laboratorio persistente ${Date.now()}-${info.retry}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora de pruebas");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const bookId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByLabel("Título de la sección").fill("El regreso");
  await page.getByLabel("Tipo", { exact: true }).selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await page
    .locator(".ProseMirror")
    .fill("Lucía decidió subir arriba. Lucía tenía los ojos verdes.");
  await page.getByRole("button", { name: "Guardar manuscrito" }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  await page.goto(`/books/${bookId}/analysis`);
  const style = page.locator("#estilo");
  await style.getByRole("button", { name: "Marcar como intencional" }).first().click();
  await expect(style.getByText(/Recurso intencional:/).first()).toBeVisible();
  await page.getByText("Configurar reglas de estilo", { exact: true }).click();
  await page.getByLabel("Omitir adverbios en -mente").check();
  await page.getByRole("button", { name: "Guardar reglas en mi cuenta" }).click();
  await expect(page.getByText("Revisión guardada en tu cuenta.").first()).toBeVisible();
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const other = await second.newPage();
    await other.goto(`/books/${bookId}/analysis`);
    await expect(
      other
        .locator("#estilo")
        .getByText(/Recurso intencional:/)
        .first(),
    ).toBeVisible();
    await other.getByText("Configurar reglas de estilo", { exact: true }).click();
    await expect(other.getByLabel("Omitir adverbios en -mente")).toBeChecked();
  } finally {
    await second.close();
  }
  await page.goto(`/characters?book=${bookId}`);
  await page.getByText("Añadir un personaje", { exact: true }).click();
  await page.locator("#new-character-field-name").fill("Lucía");
  await page.locator("#new-character-field-aliases").fill("Luli, la del faro");
  await page.getByRole("button", { name: "Crear personaje", exact: true }).click();
  await expect(page.getByText("Personaje creado.", { exact: true })).toBeVisible();
  await expect(page.getByText("También: Luli, la del faro", { exact: true })).toBeVisible();
  const [bible] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar biblia (.md)", exact: true }).click(),
  ]);
  expect(bible.suggestedFilename()).toMatch(/-biblia\.md$/);
  await page.goto(`/narrative?book=${bookId}`);
  await page.getByLabel("Modelo narrativo").selectOption("THREE_ACTS");
  await page.getByRole("button", { name: "Guardar estructura", exact: true }).click();
  await expect(page.getByText("Planificación guardada.").first()).toBeVisible();
  await page.getByLabel("Etapa de El regreso").selectOption({ label: "Acto I · Planteamiento" });
  await page.getByRole("button", { name: "Guardar etapa de «El regreso»", exact: true }).click();
  await page.getByText("Añadir acontecimiento", { exact: true }).click();
  const create = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Crear acontecimiento", exact: true }) });
  await create.getByLabel("Título del acontecimiento").fill("El nacimiento");
  await create.getByLabel("Personaje del acontecimiento").selectOption({ label: "Lucía" });
  await create.getByLabel("Fecha inicial").fill("2000-01-01");
  await create.getByLabel("Precisión de la fecha").selectOption("EXACT");
  await create.getByRole("button", { name: "Crear acontecimiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1. El nacimiento", exact: true })).toBeVisible();
  await create.getByLabel("Título del acontecimiento").fill("El viaje");
  await create.getByLabel("Personaje del acontecimiento").selectOption({ label: "Lucía" });
  await create.getByLabel("Precisión de la fecha").selectOption("EXACT");
  await create.getByLabel("Fecha inicial").fill("2010-01-01");
  await create.getByRole("button", { name: "Crear acontecimiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "2. El viaje", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Subir «El viaje»", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1. El viaje", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "1. El viaje", exact: true })).toBeVisible();
  await expect(page.getByLabel("Modelo narrativo")).toHaveValue("THREE_ACTS");
  await expect(page.getByLabel("Etapa de El regreso")).toHaveValue("Acto I · Planteamiento");
  await expect(page.getByText(/01\/01\/2000/).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("planificacion-movil.png"), fullPage: true });
  await page.goto(`/books/${bookId}/continuity`);
  await page.getByRole("button", { name: "Analizar capítulo", exact: true }).click();
  await expect(page.getByText("1 hecho", { exact: true })).toBeVisible();
  await page.goto(`/books/${bookId}/laboratorio`);
  await page.getByRole("button", { name: "Actualizar resumen del manuscrito" }).click();
  await expect(page.getByText("Estilo pendiente", { exact: true })).toBeVisible();
});

test("regresión editorial: recuperación de red, restauración y exportación real", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const title = `Regresión laboratorio ${Date.now()}-${info.retry}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora de pruebas");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const bookId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByLabel("Título de la sección").fill("La lluvia");
  await page.getByLabel("Tipo", { exact: true }).selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  const editor = page.locator(".ProseMirror"),
    initial = "La lluvia cubría los árboles de San Ramón.";
  await expect(editor).toBeVisible();
  await editor.fill(initial);
  await page.getByRole("button", { name: "Guardar manuscrito" }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  const sectionUrl = page.url();
  await page.context().setOffline(true);
  const offline = `${initial} Esta frase se escribió sin conexión.`;
  await editor.fill(offline);
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "true");
  // El estado puede pasar de local a offline mientras llega el evento de red.
  // Ambos confirman el respaldo local; tras reconectar se exige persistencia
  // real en el servidor y el mismo contenido al recargar.
  await expect(page.getByText(/guardado en este equipo/i)).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false", {
    timeout: 60_000,
  });
  await page.reload();
  await expect(editor).toHaveText(offline);
  await page.goto(`${sectionUrl}/history`);
  await expect(
    page.getByRole("heading", { name: "Historial de «La lluvia»", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restaurar", exact: true }).last().click();
  await expect(page.getByText(/Revisión .* restaurada como una versión nueva/)).toBeVisible();
  await page.goto(sectionUrl);
  await expect(editor).toHaveText(initial);
  await page.goto(`/books/${bookId}/layout`);
  await page.getByRole("radio", { name: /Manual/ }).check();
  await page.getByRole("button", { name: "Aplicar plantilla", exact: true }).click();
  await expect(page.getByText("Plantilla aplicada al libro.", { exact: true })).toBeVisible();
  await page.goto(`/books/${bookId}/preview`);
  await expect(page.getByLabel("Página 1", { exact: true })).toBeVisible();
  const previewPages = await page.locator('[aria-label^="Página "]').count();
  for (const [format, extension] of [
    ["PDF digital", "pdf"],
    ["EPUB 3", "epub"],
    ["DOCX", "docx"],
  ]) {
    await page.goto(`/books/${bookId}/export`);
    await page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: format!, exact: true }) })
      .getByRole("button", { name: "Generar", exact: true })
      .click();
    await expect(page.getByText(/^Archivo generado\./)).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar", exact: true }).first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    const path = info.outputPath(`regression.${extension}`);
    await download.saveAs(path);
    const bytes = readFileSync(path);
    if (extension === "pdf") {
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect([...bytes.toString("latin1").matchAll(/\/Type \/Page\b/gu)].length).toBe(previewPages);
    } else expect(bytes.subarray(0, 2).toString()).toBe("PK");
  }
});
