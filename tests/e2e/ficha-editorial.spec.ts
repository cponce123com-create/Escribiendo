import { expect, test } from "@playwright/test";
import { auditar, resume } from "./support/axe";

test("ficha editorial: acciones uniformes, portada accesible y seis tamaños de pantalla", async ({
  page,
}, info) => {
  const title = `Ficha editorial ${Date.now()}-${info.retry}`;
  await page.goto("/books/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Autoría").fill("Autora de pruebas");
  await page.getByRole("button", { name: "Crear libro" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar metadatos", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Agregar portada" })).toBeVisible();
  for (const width of [375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= innerWidth,
      offenders: [...document.querySelectorAll("body *")]
        .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8)
        .map((node) => ({
          tag: node.tagName,
          class: node.className,
          right: node.getBoundingClientRect().right,
        })),
    }));
    expect(layout.fits, JSON.stringify({ width, ...layout })).toBe(true);
    const heights = await page
      .locator(".book-detail-actions .btn")
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBeGreaterThanOrEqual(44);
    const violations = await auditar(page);
    expect(violations.graves, resume(violations.graves, page.url()).join("\n")).toEqual([]);
    if ([390, 1440].includes(width))
      await page.screenshot({ path: info.outputPath(`ficha-${width}.png`), fullPage: true });
  }
});
