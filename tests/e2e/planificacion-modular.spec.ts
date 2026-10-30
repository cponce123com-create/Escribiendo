import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";
import { assertDisposableDatabase } from "../../scripts/lib/e2e-database";
import { auditar, resume } from "./support/axe";

async function saveCard(page: Page, title: string, summary = "") {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill(title);
  if (summary) await dialog.getByLabel("Resumen previsto", { exact: true }).fill(summary);
  await dialog.getByRole("button", { name: "Guardar tarjeta", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test("esqueleto modular: partes, escenas, movimiento, aplicación sin pérdida y guías conectadas", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  assertDisposableDatabase(process.env.DATABASE_URL ?? "");
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(`Estructura modular ${randomUUID()}`);
  await page.getByLabel("Autoría").fill("Ana Torres");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}$/u);
  const bookId = page.url().split("/").at(-1)!;
  await page.goto(`/planning?book=${bookId}`);
  await expect(
    page.getByRole("heading", { name: "El esqueleto de tu libro", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Parte", exact: true }).click();
  await saveCard(page, "La partida", "El mundo anterior empieza a cambiar.");
  await page.getByRole("button", { name: "+ Parte", exact: true }).click();
  await saveCard(page, "El regreso");
  const first = page.getByRole("region", { name: "Parte: La partida", exact: true }),
    second = page.getByRole("region", { name: "Parte: El regreso", exact: true });
  await first.getByRole("button", { name: "+ Añadir capítulo", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill("La decisión");
  await dialog.getByLabel("Resumen previsto").fill("Una conversación obliga a decidir.");
  await dialog.getByLabel("Objetivo narrativo").fill("Presentar la decisión principal.");
  await dialog.getByText("Arco, conflicto y desarrollo", { exact: true }).click();
  await dialog.getByLabel("Cierre o cambio al finalizar").fill("La decisión queda tomada.");
  await dialog.getByLabel("Extensión orientativa (palabras)").fill("2500");
  await dialog.getByRole("button", { name: "Guardar tarjeta", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await first.getByRole("button", { name: "+ Añadir escena", exact: true }).click();
  await saveCard(page, "La llegada", "El personaje llega al lugar acordado.");
  await first.getByText("Escenas · 1", { exact: true }).click();
  await expect(
    first.getByRole("button", { name: "Editar «La llegada»", exact: true }),
  ).toBeVisible();
  await first.getByRole("button", { name: "+ Añadir capítulo", exact: true }).click();
  await saveCard(page, "La respuesta");
  const stale = await page.context().newPage();
  await stale.goto(`/planning?book=${bookId}`);
  await stale.getByRole("button", { name: "Editar «La decisión»", exact: true }).click();
  await stale
    .getByRole("dialog")
    .getByLabel("Objetivo narrativo")
    .fill("Objetivo de una pestaña obsoleta");
  await first.getByRole("button", { name: "Mover «La respuesta»", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destino", { exact: true }).selectOption({ label: "Parte · El regreso" });
  await dialog.getByRole("button", { name: "Mover tarjeta", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    second.getByRole("button", { name: "Editar «La respuesta»", exact: true }),
  ).toBeVisible();
  await stale
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar tarjeta", exact: true })
    .click();
  await expect(stale.getByRole("dialog").getByText(/el plan cambió en otra pestaña/)).toBeVisible();
  await expect(stale.getByRole("dialog").getByLabel("Objetivo narrativo")).toHaveValue(
    "Objetivo de una pestaña obsoleta",
  );
  await stale.close();

  await first.getByRole("button", { name: "Editar «La decisión»", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill("Cambio sin guardar");
  await dialog.getByRole("button", { name: "Cerrar diálogo" }).click();
  await expect(dialog.getByText("Hay cambios sin guardar en esta tarjeta.")).toBeVisible();
  await dialog.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(dialog.getByLabel("Título", { exact: true })).toHaveValue("Cambio sin guardar");
  await dialog.getByRole("button", { name: "Cerrar diálogo" }).click();
  await dialog.getByRole("button", { name: "Descartar cambios y cerrar", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "Editar «La decisión»", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aplicar estructura al manuscrito", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar y aplicar estructura", exact: true })
    .click();
  await expect(page.getByText(/Estructura aplicada: 4 secciones nuevas/)).toBeVisible();
  let sections = await prisma.bookSection.findMany({ where: { bookId, deletedAt: null } });
  expect(sections).toHaveLength(4);
  expect(sections.filter((s) => s.type === "CHAPTER")).toHaveLength(2);
  const chapter = sections.find((s) => s.title === "La decisión")!;
  const content = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "MANUSCRITO QUE DEBE CONSERVARSE" }] },
    ],
  };
  await prisma.bookSection.update({
    where: { id: chapter.id },
    data: { content, version: 2, wordCount: 5 },
  });
  await first.getByRole("button", { name: "Mover «La decisión»", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Destino", { exact: true }).selectOption({ label: "Parte · El regreso" });
  await dialog
    .getByLabel("Posición", { exact: true })
    .selectOption({ label: "Antes de «La respuesta»" });
  await dialog.getByRole("button", { name: "Mover tarjeta", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Aplicar estructura al manuscrito", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar y aplicar estructura", exact: true })
    .click();
  await expect(page.getByText(/Estructura aplicada: 0 secciones nuevas/)).toBeVisible();
  sections = await prisma.bookSection.findMany({ where: { bookId, deletedAt: null } });
  expect(sections).toHaveLength(4);
  const saved = sections.find((s) => s.id === chapter.id)!;
  expect(saved.content).toEqual(content);
  expect(saved.version).toBe(2);
  expect(saved.parentId).toBe(sections.find((s) => s.title === "El regreso")!.id);
  expect(saved.sortOrder).toBeLessThan(sections.find((s) => s.title === "La respuesta")!.sortOrder);
  await page.getByRole("button", { name: "Flujo de trabajo", exact: true }).click();
  await page.getByRole("button", { name: "Mover «La decisión»", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Estado de destino").selectOption("WRITING");
  await dialog.getByRole("button", { name: "Mover tarjeta", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Estado: En escritura", exact: true })
      .getByRole("button", { name: "Editar «La decisión»", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Estructura", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath("estructura-escritorio.png"), fullPage: true });
  const accessibility = await auditar(page);
  expect(resume(accessibility.graves, page.url())).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("region", { name: "Sin parte", exact: true })).toHaveCount(0);
  expect(
    await second.evaluate((column) => column.getBoundingClientRect().height <= innerHeight),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("estructura-movil.png"), fullPage: true });
  await page.goto(`/planning?book=${bookId}&view=guides&section=${chapter.id}`);
  await expect(page.getByLabel("Capítulo o sección del manuscrito")).toHaveValue(chapter.id);
  await page.getByText("Ficha maestra del libro", { exact: true }).click();
  const master = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Guardar ficha maestra", exact: true }) });
  await master
    .getByLabel("Premisa y situación de partida")
    .fill("Una conversación cambia el rumbo.");
  await master
    .getByLabel("Reglas y hechos aprobados del libro")
    .fill("Conservar la estructura aprobada.");
  await master.getByLabel("Guardar como").selectOption("APPROVED");
  await master.getByRole("button", { name: "Guardar ficha maestra", exact: true }).click();
  const guide = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Guardar guía del capítulo", exact: true }) });
  await expect(guide.getByLabel("Objetivo narrativo")).toHaveValue(
    "Presentar la decisión principal.",
  );
  await expect(guide.getByLabel("Escenas en orden")).toHaveValue(
    "La llegada: El personaje llega al lugar acordado.",
  );
});

test("un esquema inicial de cinco partes distribuye treinta capítulos sin crear prosa", async ({
  page,
}) => {
  assertDisposableDatabase(process.env.DATABASE_URL ?? "");
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(`Libro modular nuevo ${randomUUID()}`);
  await page.getByLabel("Autoría").fill("Ana Torres");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}$/u);
  const bookId = page.url().split("/").at(-1)!;
  await page.goto(`/planning?book=${bookId}`);
  await page.getByRole("button", { name: "Crear esquema inicial", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Modelo inicial").selectOption("FIVE_PARTS");
  await dialog.getByLabel("Capítulos iniciales").fill("30");
  await dialog.getByRole("button", { name: "Crear esquema inicial", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const items = await prisma.storyPlanItem.findMany({ where: { bookId, deletedAt: null } });
  expect(items.filter((n) => n.kind === "ACT")).toHaveLength(5);
  expect(items.filter((n) => n.kind === "CHAPTER")).toHaveLength(30);
  expect(items.every((n) => n.summary === null)).toBe(true);
  expect(await prisma.bookSection.count({ where: { bookId } })).toBe(0);
});
