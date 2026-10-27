import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("el dashboard móvil navega desde tarjetas y filas completas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "¿Qué quieres hacer?" })).toBeVisible();
  await page.getByText("Más herramientas", { exact: true }).click();
  await expect(
    page.locator(".dashboard-mobile-actions").getByRole("link", { name: "Mundos" }),
  ).toBeVisible();

  for (const [label, path] of [
    ["Ver libros:", "/books"],
    ["Ver palabras:", "/stats"],
    ["Ver capítulos:", "/books"],
    ["Ver equipo:", "/team"],
  ] as const) {
    await page.getByRole("link", { name: new RegExp(label, "u") }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`, "u"));
    await page.goto("/dashboard");
  }

  const title = `Libro del panel ${randomUUID()}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Ana Torres");
  await page.getByRole("button", { name: "Crear libro" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.goto("/dashboard");
  const card = page.getByRole("link", { name: `Abrir ${title}` });
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator(".dashboard-stat-link").first()).toHaveCSS(
    "background-color",
    "rgb(30, 27, 22)",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await card.getByText("Actualizado:", { exact: false }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
