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
  await page.getByRole("button", { name: "Lista", exact: true }).click();
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
  await dialog.getByLabel("Etiquetas (separadas por comas)").fill("Duelo, Inicio");
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
  await dialog.getByRole("button", { name: "Guardar estado", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Estado: En escritura", exact: true })
      .getByRole("button", { name: "Editar «La decisión»", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mover «La decisión»", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Estado de destino").selectOption("DONE");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar estado", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Capítulos terminados", exact: true }),
  ).toHaveAttribute("value", "50");
  await page.getByRole("button", { name: "Tablero", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".plan-map-labels").getByText("Duelo", { exact: true })).toBeVisible();
  expect(
    (
      await prisma.storyPlanItem.findFirst({
        where: { bookId, title: "La decisión", deletedAt: null },
      })
    )?.visual,
  ).toMatchObject({ labels: ["Duelo", "Inicio"] });
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
}, info) => {
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
  await expect(page.locator(".plan-map-card")).toHaveCount(30);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const boxes = await page.locator(".plan-map-card").evaluateAll((cards) =>
      cards.map((card) => {
        const r = card.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          width: innerWidth,
          height: innerHeight,
        };
      }),
    );
    expect(
      boxes.every((r) => r.left >= 0 && r.right <= r.width && r.top >= 0 && r.bottom <= r.height),
      JSON.stringify({
        viewport,
        outside: boxes.filter(
          (r) => r.left < 0 || r.right > r.width || r.top < 0 || r.bottom > r.height,
        ),
      }),
    ).toBe(true);
  }
  await page.screenshot({
    path: info.outputPath("tablero-referencia-30-capitulos.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Línea de tiempo", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Recorrido del libro", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".plan-timeline .plan-map-card")).toHaveCount(30);
  await page.getByRole("button", { name: "Tablero", exact: true }).click();
  await page.getByRole("button", { name: "Ampliar tablero", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Salir del tablero ampliado", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Ampliar tablero", exact: true })).toBeFocused();
  const book = await prisma.book.findUniqueOrThrow({
    where: { id: bookId },
    select: { workspaceId: true },
  });
  const asset = await prisma.asset.create({
    data: {
      workspaceId: book.workspaceId,
      publicId: `e2e-reference-${randomUUID()}`,
      secureUrl: "/images/studio/writing-desk.webp",
      format: "webp",
      originalFilename: "Referencia de prueba",
    },
  });
  await prisma.bookAsset.create({ data: { bookId, assetId: asset.id, kind: "INTERIOR_IMAGE" } });
  await page.reload();
  await page.getByRole("button", { name: "Editar parte «Parte I»", exact: true }).click();
  const visualDialog = page.getByRole("dialog");
  await visualDialog.getByText("Apariencia de la parte", { exact: true }).click();
  await visualDialog.getByLabel("Color de la parte", { exact: true }).selectOption("violet");
  await visualDialog.getByLabel("Imagen de referencia", { exact: true }).selectOption(asset.id);
  await visualDialog.getByRole("button", { name: "Guardar tarjeta", exact: true }).click();
  await expect(visualDialog).not.toBeVisible();
  await page.reload();
  const visualPart = page.getByRole("region", { name: "Parte: Parte I", exact: true });
  await expect(visualPart).toHaveClass(/plan-tone-violet/);
  await expect(visualPart.locator(".plan-part-image img")).toHaveAttribute(
    "src",
    "/images/studio/writing-desk.webp",
  );
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute("data-theme", theme),
      theme,
    );
    const result = await auditar(page);
    expect(resume(result.graves, page.url())).toEqual([]);
  }
  await page.getByRole("button", { name: "Editar «Capítulo 1»", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Resumen previsto", { exact: true }),
  ).toBeVisible();
});

test("gestión completa: eliminar, recuperar ramas y vaciar el plan conserva el manuscrito", async ({
  page,
}) => {
  test.setTimeout(90000);
  assertDisposableDatabase(process.env.DATABASE_URL ?? "");
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(`Gestión del plan ${randomUUID()}`);
  await page.getByLabel("Autoría").fill("Ana Torres");
  await page.getByRole("button", { name: "Crear libro", exact: true }).click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}$/u);
  const bookId = page.url().split("/").at(-1)!;
  await page.goto(`/planning?book=${bookId}`);
  await page.getByRole("button", { name: "+ Parte", exact: true }).click();
  await saveCard(page, "Parte de gestión");
  await page
    .getByRole("button", { name: "Gestionar parte «Parte de gestión»", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Añadir capítulo", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Etiquetas (separadas por comas)")
    .fill("Gestión, Memoria");
  await saveCard(page, "Capítulo de gestión");
  await page.getByRole("button", { name: "Gestionar «Capítulo de gestión»", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Añadir escena", exact: true })
    .click();
  await saveCard(page, "Escena de gestión");
  await page.getByRole("button", { name: "Aplicar estructura al manuscrito", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar y aplicar estructura", exact: true })
    .click();
  await expect(page.getByText(/Estructura aplicada: 2 secciones nuevas/)).toBeVisible();
  const section = await prisma.bookSection.findFirstOrThrow({
    where: { bookId, title: "Capítulo de gestión", deletedAt: null },
  });
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "TEXTO QUE LA PAPELERA DEL PLAN DEBE CONSERVAR" }],
      },
    ],
  };
  await prisma.bookSection.update({ where: { id: section.id }, data: { content, version: 2 } });
  const before = await prisma.storyPlanItem.findMany({
    where: { bookId, deletedAt: null },
    select: { id: true, sectionId: true, visual: true },
  });
  await page.getByRole("button", { name: "Gestionar «Capítulo de gestión»", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cambiar estado", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Estado de destino").selectOption("DONE");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar estado", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Capítulos terminados", exact: true }),
  ).toHaveAttribute("value", "100");
  await page.getByRole("button", { name: "Copiar estructura", exact: true }).click();
  expect(
    await page.getByRole("dialog").getByLabel("Estructura lista para copiar").inputValue(),
  ).toContain("Capítulo de gestión");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar diálogo", exact: true })
    .click();
  async function deletePart() {
    await page
      .getByRole("button", { name: "Gestionar parte «Parte de gestión»", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eliminar del plan", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByText(/3 tarjetas/)).toBeVisible();
  }
  await deletePart();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar diálogo", exact: true })
    .click();
  expect(await prisma.storyPlanItem.count({ where: { bookId, deletedAt: null } })).toBe(3);
  await deletePart();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sí, eliminar del plan", exact: true })
    .click();
  await expect(page.getByText(/3 tarjetas enviadas a la papelera/)).toBeVisible();
  expect(await prisma.storyPlanItem.count({ where: { bookId, deletedAt: null } })).toBe(0);
  await expect(page.getByRole("button", { name: "Gestionar plan", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Gestionar plan", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Papelera (1)", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restaurar «Parte de gestión»", exact: true })
    .click();
  await expect(page.getByText(/3 tarjetas restauradas/)).toBeVisible();
  expect(
    await prisma.storyPlanItem.findMany({
      where: { bookId, deletedAt: null },
      select: { id: true, sectionId: true, visual: true },
      orderBy: { id: "asc" },
    }),
  ).toEqual([...before].sort((a, b) => a.id.localeCompare(b.id)));
  expect(await prisma.bookSection.count({ where: { bookId, deletedAt: null } })).toBe(2);
  expect(
    (await prisma.bookSection.findUniqueOrThrow({ where: { id: section.id } })).content,
  ).toEqual(content);
  expect((await prisma.bookSection.findUniqueOrThrow({ where: { id: section.id } })).version).toBe(
    2,
  );
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page.getByText("Escenas · 1", { exact: true }).click();
  await page.getByRole("button", { name: "Gestionar «Escena de gestión»", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar del plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sí, eliminar del plan", exact: true })
    .click();
  await expect(page.getByText(/1 tarjeta enviada a la papelera/)).toBeVisible();
  await page.getByRole("button", { name: "Gestionar plan", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Papelera (1)", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restaurar «Escena de gestión»", exact: true })
    .click();
  await expect(page.getByText(/1 tarjeta restaurada/)).toBeVisible();
  await page.getByRole("button", { name: "Gestionar plan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar todo el plan", exact: true })
    .click();
  const clear = page.getByRole("dialog");
  await clear.getByLabel("Escribe ELIMINAR para confirmar").fill("eliminar");
  await expect(
    clear.getByRole("button", { name: "Sí, vaciar el plan", exact: true }),
  ).toBeDisabled();
  await clear.getByLabel("Escribe ELIMINAR para confirmar").fill("ELIMINAR");
  await clear.getByRole("button", { name: "Sí, vaciar el plan", exact: true }).click();
  await expect(page.getByText(/3 tarjetas enviadas a la papelera/)).toBeVisible();
  expect(await prisma.storyPlanItem.count({ where: { bookId, deletedAt: null } })).toBe(0);
  expect(
    (await prisma.bookSection.findUniqueOrThrow({ where: { id: section.id } })).content,
  ).toEqual(content);
});
