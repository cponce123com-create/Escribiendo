import { expect, test } from "@playwright/test";
import { auditar, resume } from "./support/axe";

test("tema compartido, búsqueda real, menú retráctil y guía", async ({ page }, info) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Tu estudio está listo para crear." }),
  ).toBeVisible();
  // The shortcut is advertised only after its listener is active.
  const search = page.getByRole("searchbox", { name: "Buscar en la biblioteca" });
  await expect(search).toHaveAttribute("aria-keyshortcuts", "Control+k Meta+k");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(search).toBeFocused();
  await search.fill("consulta-e2e-sin-resultados");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/books\?q=consulta-e2e-sin-resultados/);
  await page.getByRole("button", { name: "Ocultar menú principal" }).click();
  await page.reload();
  await expect(page.locator("#navegacion-principal")).toBeHidden();
  await page.getByRole("button", { name: "Mostrar menú principal" }).click();
  await page.getByRole("link", { name: "Guía y recursos" }).click();
  await expect(page.getByRole("heading", { name: "Todo empieza con una página." })).toBeVisible();
  for (const route of ["/dashboard", "/books", "/notes", "/stats", "/team", "/account", "/guide"]) {
    await page.goto(route);
    await expect(page.locator(".frontend-studio")).toBeVisible();
    expect(resume((await auditar(page)).graves, route)).toEqual([]);
  }
  await page.goto("/dashboard");
  await page.screenshot({ path: info.outputPath("panel-escritorio.png"), fullPage: true });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  expect(resume((await auditar(page)).graves, "panel oscuro")).toEqual([]);
  await page.screenshot({ path: info.outputPath("panel-oscuro.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(
    page.getByRole("heading", { name: "Tu estudio está listo para crear." }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("panel-movil.png"), fullPage: true });
});
