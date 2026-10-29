import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";
import { assertDisposableDatabase } from "../../scripts/lib/e2e-database";

test("la guía conserva títulos, usa solo contexto anterior aprobado y detecta cambios posteriores", async ({
  page,
  context,
}, info) => {
  assertDisposableDatabase(process.env.DATABASE_URL ?? "");
  await page.goto("/books/new");
  const title = `Plan aprobado ${randomUUID()}`;
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Ana Torres");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}$/u);
  const bookId = page.url().split("/").at(-1)!;
  const firstId = randomUUID(),
    secondId = randomUUID(),
    futureId = randomUUID();
  await prisma.bookSection.createMany({
    data: [
      { id: firstId, bookId, type: "CHAPTER", title: "Capítulo 1 · El regreso", sortOrder: 0 },
      { id: secondId, bookId, type: "CHAPTER", title: "Capítulo 2 · La decisión", sortOrder: 1 },
      { id: futureId, bookId, type: "CHAPTER", title: "Capítulo 3 · El viaje", sortOrder: 2 },
    ],
  });
  await page.goto(`/planning?book=${bookId}`);
  await page.getByText("Ficha maestra del libro", { exact: true }).click();
  const master = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Guardar ficha maestra", exact: true }) });
  await master.getByLabel("Premisa y situación de partida").fill("Una persona vuelve a su pueblo.");
  await master
    .getByLabel("Reglas y hechos aprobados del libro")
    .fill("No cambiar títulos ni adelantar el viaje.");
  await master.getByLabel("Narrador y punto de vista").fill("Primera persona");
  await master.getByLabel("Guardar como").selectOption("APPROVED");
  await master.getByRole("button", { name: "Guardar ficha maestra", exact: true }).click();
  await expect(master.getByText("Revisión 1 · Aprobada", { exact: true })).toBeVisible();
  const chapter = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Guardar guía del capítulo", exact: true }) });
  const stale = await context.newPage();
  await stale.goto(`/planning?book=${bookId}`);
  const staleChapter = stale
    .locator("form")
    .filter({ has: stale.getByRole("button", { name: "Guardar guía del capítulo", exact: true }) });
  await page.getByLabel("Capítulo o sección del manuscrito").selectOption(firstId);
  await chapter.getByLabel("Objetivo narrativo").fill("Presentar el regreso");
  await chapter.getByLabel("Escenas en orden").fill("1. Llegada.\n2. Conversación.");
  await chapter.getByLabel("Situación al finalizar").fill("Decide quedarse.");
  await chapter
    .getByLabel("Resumen de lo escrito (revisado por ti)")
    .fill("HECHO_ANTERIOR_APROBADO: llegó y decidió quedarse.");
  await chapter.getByLabel("Guardar como").selectOption("APPROVED");
  await chapter.getByRole("button", { name: "Guardar guía del capítulo", exact: true }).click();
  await expect(chapter.getByText("Revisión 1 · Aprobada", { exact: true })).toBeVisible();
  await staleChapter.getByLabel("Objetivo narrativo").fill("Cambio de otra pestaña");
  await staleChapter.getByLabel("Escenas en orden").fill("Una escena distinta");
  await staleChapter.getByLabel("Situación al finalizar").fill("Otro final");
  await staleChapter.getByLabel("Guardar como").selectOption("APPROVED");
  await staleChapter
    .getByRole("button", { name: "Guardar guía del capítulo", exact: true })
    .click();
  await expect(stale.getByText(/La guía cambió en otra pestaña/)).toBeVisible();
  await expect(staleChapter.getByLabel("Objetivo narrativo")).toHaveValue("Cambio de otra pestaña");
  expect(await prisma.chapterWritingBrief.count({ where: { sectionId: firstId } })).toBe(1);
  await stale.close();
  await page.getByLabel("Capítulo o sección del manuscrito").selectOption(secondId);
  await chapter.getByLabel("Objetivo narrativo").fill("Mostrar la decisión");
  await chapter.getByLabel("Escenas en orden").fill("1. Reflexiona.\n2. Decide.");
  await chapter.getByLabel("Situación al finalizar").fill("La decisión queda tomada.");
  await chapter
    .getByLabel("Qué no debe ocurrir ni revelarse todavía")
    .fill("No adelantar el viaje.");
  await chapter.getByRole("button", { name: "Guardar guía del capítulo", exact: true }).click();
  await expect(chapter.getByText("Revisión 1 · Borrador", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preparar instrucciones para IA", exact: true }).click();
  await expect(page.getByText(/Aprueba la ficha maestra y la guía del capítulo/)).toBeVisible();
  await chapter.getByLabel("Guardar como").selectOption("APPROVED");
  await chapter.getByRole("button", { name: "Guardar guía del capítulo", exact: true }).click();
  await expect(chapter.getByText("Revisión 2 · Aprobada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preparar instrucciones para IA", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Instrucciones para la IA" });
  const text = await dialog.getByRole("textbox").inputValue();
  expect(text).toContain("CAPÍTULO A DESARROLLAR: Capítulo 2 · La decisión");
  expect(text).toContain("HECHO_ANTERIOR_APROBADO");
  expect(text).toContain("No adelantar el viaje.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Copiar instrucciones", exact: true }).click();
  await expect(dialog.getByText(/Instrucciones copiadas/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await dialog.getByRole("button", { name: "Cerrar diálogo" }).click();
  await page.getByRole("button", { name: "Preparar instrucciones para IA", exact: true }).click();
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("Portapapeles no disponible");
    };
  });
  await dialog.getByRole("button", { name: "Copiar instrucciones", exact: true }).click();
  await expect(
    dialog.getByText(/El texto está seleccionado para copiarlo manualmente/),
  ).toBeVisible();
  expect(
    await dialog
      .getByRole("textbox")
      .evaluate(
        (node: HTMLTextAreaElement) =>
          document.activeElement === node &&
          node.selectionStart === 0 &&
          node.selectionEnd === node.value.length,
      ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Cerrar diálogo" }).click();
  const manuscript = await prisma.bookSection.findUniqueOrThrow({ where: { id: secondId } });
  expect(manuscript.version).toBe(1);
  expect(manuscript.content).toEqual({});
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("planificacion-ia-movil.png"), fullPage: true });
  await prisma.bookSection.update({
    where: { id: secondId },
    data: { title: "Título cambiado después" },
  });
  await page.getByRole("button", { name: "Preparar instrucciones para IA", exact: true }).click();
  await expect(page.getByText(/El título, la autoría o la estructura cambiaron/)).toBeVisible();
  expect(await prisma.bookWritingBrief.count({ where: { bookId } })).toBe(1);
  expect(await prisma.chapterWritingBrief.count({ where: { sectionId: secondId } })).toBe(2);
});
