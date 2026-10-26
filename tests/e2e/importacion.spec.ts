import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { buildZip } from "../../packages/export-engine/src/zip";
test("analiza un DOCX y permite revisar la estructura antes de crear el libro", async ({
  page,
}) => {
  const title = `Importación revisada ${randomUUID()}`;
  const p = (text: string, heading = false) =>
    `<w:p>${heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const xml = `<w:document xmlns:w="urn:w"><w:body>${p("Dedicatoria", true)}${p("Para quienes leen.")}${p("Capítulo 1", true)}${p("Primera aventura.")}${p("Capítulo 2", true)}${p("La segunda aventura permanece completa.")}</w:body></w:document>`;
  const data = buildZip(
    [{ name: "word/document.xml", data: new TextEncoder().encode(xml) }],
    new Date("2026-01-01T00:00:00Z"),
  );
  await page.goto("/books/import");
  await page.getByLabel("Archivo del libro", { exact: true }).setInputFiles({
    name: "novela.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(data),
  });
  await expect(page.getByRole("button", { name: "Confirmar e importar libro" })).toHaveCount(0);
  await page.getByRole("button", { name: "Analizar archivo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisar importación" })).toBeVisible();
  await expect(page).toHaveURL(/\/books\/import$/u);
  await expect(page.getByLabel("Tipo de sección 1", { exact: true })).toHaveValue("DEDICATION");
  await page.getByLabel("Título del libro", { exact: true }).fill(title);
  await page.getByLabel("Autoría", { exact: true }).fill("Ana Autora");
  await page.getByLabel("Título de sección 2", { exact: true }).fill("El viaje empieza");
  await page.getByRole("button", { name: "Confirmar e importar libro" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Capítulo · Capítulo 2/u }).click();
  await expect(page.locator(".ProseMirror")).toContainText(
    "La segunda aventura permanece completa.",
  );
});

test("advierte cuando un encabezado visual no acredita un capítulo", async ({ page }) => {
  const xml =
    '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>LA NOCHE ESTABA FRÍA</w:t></w:r></w:p><w:p><w:r><w:t>Aquí comienza el relato.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo 2</w:t></w:r></w:p><w:p><w:r><w:t>El viaje sigue.</w:t></w:r></w:p></w:body></w:document>';
  const data = buildZip(
    [{ name: "word/document.xml", data: new TextEncoder().encode(xml) }],
    new Date("2026-01-01T00:00:00Z"),
  );
  await page.goto("/books/import");
  await page.getByLabel("Archivo del libro", { exact: true }).setInputFiles({
    name: "dudoso.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(data),
  });
  await page.getByRole("button", { name: "Analizar archivo", exact: true }).click();
  await expect(page.getByText(/Algunas divisiones tienen evidencia débil/)).toBeVisible();
  await expect(page.getByText(/Detección baja \(30\/100\)/)).toBeVisible();
  await expect(page).toHaveURL(/\/books\/import$/u);
});
