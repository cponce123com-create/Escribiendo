import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("la actividad real guardada cabe en su tarjeta en móvil y escritorio", async ({ page }) => {
  const title = `Actividad E2E ${randomUUID()}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora E2E");
  await page.getByRole("button", { name: "Crear libro" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByLabel("Título de la sección").fill("Un día de escritura");
  await page.getByLabel("Tipo").selectOption("CHAPTER");
  await page.getByRole("button", { name: "Añadir sección" }).click();
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await editor.fill("palabra ".repeat(5209).trim());
  await page.getByRole("button", { name: "Guardar manuscrito" }).click();
  await expect(page.locator(".manuscript-editor")).toHaveAttribute("data-dirty", "false");
  await page.goto("/stats");
  const chart = page.getByRole("region", { name: "palabras por día", exact: true });
  await expect(chart).toBeVisible();
  await expect(chart.locator(".writing-activity-row").first()).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const fits = await chart.locator(".writing-activity-row").evaluateAll((rows) =>
      rows.every((row) => {
        const bounds = row.getBoundingClientRect();
        const childrenFit = [...row.children].every((child) => {
          const box = child.getBoundingClientRect();
          return box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
        });
        const track = row.querySelector(".writing-activity-track")!.getBoundingClientRect();
        const bar = row.querySelector(".writing-activity-bar")!.getBoundingClientRect();
        return childrenFit && bar.width <= track.width + 1;
      }),
    );
    expect(fits, `Actividad diaria a ${width}px`).toBe(true);
  }
});
