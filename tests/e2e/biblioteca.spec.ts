import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../../packages/database/src/client";
import { assertDisposableDatabase } from "../../scripts/lib/e2e-database";
import { E2E_USER_EMAIL } from "./support/session";

/**
 * Biblioteca y manuscritos: creación de libros, estructura de secciones,
 * edición con Tiptap, revisiones inmutables y progreso.
 *
 * La sesión la deja preparada el proyecto de preparación, que también crea
 * la cuenta de pruebas. Aquí no se abre una sesión por prueba: hacerlo
 * consume el presupuesto de intentos de acceso por dirección, que existe
 * para detener la fuerza bruta.
 */
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = `El oficio de escribir ${randomUUID()}`;
const SECTION_TITLE = "Capítulo 1 · El principio";

test.describe("Biblioteca", () => {
  test("la biblioteca vacía ofrece crear el primer libro", async ({ page }) => {
    assertDisposableDatabase(process.env.DATABASE_URL ?? "");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: E2E_USER_EMAIL } });
    const workspace = await prisma.workspace.create({
      data: {
        name: "Biblioteca vacía E2E",
        slug: `biblioteca-vacia-${randomUUID()}`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    let original: string | undefined;
    try {
      await page.goto("/books");
      await page.locator("details.workspace-menu > summary").click();
      const selector = page.getByLabel("Cambiar de espacio de trabajo");
      original = await selector.inputValue();
      await selector.selectOption(workspace.id);
      await page.getByRole("button", { name: "Cambiar de estudio" }).click();
      await expect(page.getByText("Has cambiado de estudio.")).toBeVisible();
      await page.goto("/books");
      await expect(page.getByRole("heading", { name: "Los libros del estudio" })).toBeVisible();
      await expect(page.getByText("La biblioteca está vacía.")).toBeVisible();
      await page.getByRole("link", { name: "Crear el primer libro", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Nuevo libro" })).toBeVisible();
    } finally {
      if (original) {
        await page.goto("/books");
        await page.locator("details.workspace-menu > summary").click();
        await page.getByLabel("Cambiar de espacio de trabajo").selectOption(original);
        await page.getByRole("button", { name: "Cambiar de estudio" }).click();
        await expect(page.getByText("Has cambiado de estudio.")).toBeVisible();
      }
      await prisma.workspace.delete({ where: { id: workspace.id } });
    }
  });

  test("un libro se crea con sus metadatos y aparece en la biblioteca", async ({ page }) => {
    await page.goto("/books/new");

    await page.getByLabel("Título", { exact: true }).fill(BOOK_TITLE);
    await page.getByLabel("Subtítulo").fill("Notas de un taller de escritura");
    await page.getByLabel("Autoría").fill("Ana Torres");
    await page.getByLabel("Género").fill("Ensayo");
    await page.getByLabel("Objetivo de palabras").fill("40000");

    await Promise.all([
      page.waitForURL(/\/books\/[0-9a-f-]{36}$/u),
      page.getByRole("button", { name: "Crear libro" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();
    await expect(page.getByText("Ensayo · ES")).toBeVisible();

    await page.goto("/books");
    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ has: page.getByRole("heading", { name: BOOK_TITLE }) })
        .getByText("Ana Torres"),
    ).toBeVisible();
  });

  test("el buscador filtra la biblioteca", async ({ page }) => {
    await page.goto("/books");

    await page.getByLabel("Buscar", { exact: true }).fill("oficio");
    await page.getByRole("button", { name: "Filtrar" }).click();

    await expect(page).toHaveURL(/[?&]q=oficio/u);
    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();

    await page.getByLabel("Buscar", { exact: true }).fill("no-existe-este-libro");
    await page.getByRole("button", { name: "Filtrar" }).click();

    await expect(page.getByText("Ningún libro coincide con el filtro.")).toBeVisible();
  });

  test("se añade una sección y se abre su editor", async ({ page }) => {
    await page.goto("/books");

    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();

    await page.getByLabel("Título de la sección").fill(SECTION_TITLE);
    await page.getByLabel("Tipo").selectOption("CHAPTER");

    await Promise.all([
      page.waitForURL(/\/sections\/[0-9a-f-]{36}$/u),
      page.getByRole("button", { name: "Añadir sección" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: SECTION_TITLE })).toBeVisible();
    await expect(page.locator(".studio-chapter-meta")).toContainText("0 palabras");
    await expect(page.getByRole("link", { name: /Versión 1/u })).toBeVisible();
  });

  test("el manuscrito se guarda y crea una revisión", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("El primer párrafo del manuscrito.");

    await page.getByRole("button", { name: "Guardar manuscrito" }).click();

    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();
    await expect(page.getByText(/5 palabras/).first()).toBeVisible();

    // La revisión aparece en su pestaña; la búsqueda es la herramienta inicial.
    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    await expect(page.getByText("Guardado manual").first()).toBeVisible();
  });

  test("el libro refleja las palabras y el progreso", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();

    const words = page.locator(".stat-card").filter({ hasText: "Palabras" });
    await expect(words).toContainText("5");

    // 5 palabras sobre un objetivo de 40000: 0,0125 %, redondeado a 0,01 %.
    const progress = page.locator(".stat-card").filter({ hasText: "Progreso" });
    await expect(progress).toContainText("0,01%");
  });

  test("una segunda versión se añade al historial", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Y una segunda frase añadida después.");

    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    await expect(page.getByText("Guardado manual").first()).toBeVisible();
    // Dos revisiones guardadas: la segunda junto a la primera.
    await expect(page.getByText("Guardado manual")).toHaveCount(2);
  });

  test("restaurar una revisión crea una versión nueva sin alterar la anterior", async ({
    page,
  }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    const revisions = page.locator("ol li");
    await expect(revisions).toHaveCount(2);

    // Se restaura la más antigua. La sección nace en la versión 1 sin
    // historial, así que la primera revisión guardada es la 2.
    await page.getByRole("button", { name: "Restaurar" }).last().click();

    await expect(page.getByText(/Revisión \d+ restaurada como una versión nueva/u)).toBeVisible();
    await expect(page.getByText("Restauración").first()).toBeVisible();

    // El historial conserva las revisiones anteriores y añade la nueva.
    await expect(page.locator("ol li")).toHaveCount(3);
  });

  test("el estado del libro cambia según las transiciones permitidas", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();

    await page.getByLabel("Nuevo estado").selectOption("IN_PROGRESS");
    await page.getByRole("button", { name: "Cambiar estado" }).click();

    await expect(page.getByText("Estado actualizado.")).toBeVisible();
    await expect(page.getByText("En escritura").first()).toBeVisible();
  });

  test("el estado no puede saltar de borrador a completo", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();

    // Desde «En escritura» no se ofrece «Completo»: hay que pasar por revisión.
    const select = page.getByLabel("Nuevo estado");
    await expect(select).toBeVisible();

    const options = await select.locator("option").allTextContents();
    expect(options).not.toContain("Completo");
    expect(options).toContain("En revisión");
  });
});
