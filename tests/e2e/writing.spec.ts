import { expect, test } from "@playwright/test";

/**
 * Escritura asistida: notas privadas, objetivos, estadísticas, comentarios
 * editoriales, flujo de revisión y comparación de revisiones.
 *
 * El archivo es autocontenido: crea su propio libro y su propia sección, de
 * modo que pueda ejecutarse en solitario.
 */
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = "Cuaderno de trabajo";
const SECTION_TITLE = "Prólogo del cuaderno";

test.describe("Escritura asistida", () => {
  test("se crea un libro y una sección para trabajar sobre ellos", async ({ page }) => {
    await page.goto("/books/new");

    await page.getByLabel("Título", { exact: true }).fill(BOOK_TITLE);
    await page.getByLabel("Autoría").fill("Ana Torres");
    await page.getByRole("button", { name: "Crear libro" }).click();

    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();

    await page.getByLabel("Título de la sección").fill(SECTION_TITLE);
    await page.getByLabel("Tipo").selectOption("PROLOGUE");
    await page.getByRole("button", { name: "Añadir sección" }).click();

    await expect(page.getByRole("heading", { name: SECTION_TITLE })).toBeVisible();
  });

  test("una nota se crea, aparece en el libro y se puede eliminar", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Notas", exact: true })
      .click();

    await expect(page.getByRole("heading", { name: "Notas de trabajo" })).toBeVisible();

    await page.getByLabel("Título de la nota").fill("Pendiente: revisar el cierre");
    await page.getByLabel("Contenido").fill("El último párrafo necesita un matiz.");
    await page.getByRole("button", { name: "Guardar nota" }).click();

    await expect(page.getByText("Nota guardada.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pendiente: revisar el cierre" })).toBeVisible();

    // Borrar una nota pide confirmación: un clic de más no debería bastar.
    await page.getByRole("button", { name: "Eliminar" }).first().click();
    await expect(page.getByRole("button", { name: "Sí, eliminar" })).toBeVisible();
    await page.getByRole("button", { name: "Sí, eliminar" }).click();
    await expect(page.getByText("Nota eliminada.")).toBeVisible();
  });

  test("las notas se listan en la página propia", async ({ page }) => {
    await page.goto("/notes");

    await expect(page.getByRole("heading", { name: "Mis notas" })).toBeVisible();
    await expect(page.getByText("Apuntes privados de todos tus libros.")).toBeVisible();
  });

  test("se define un objetivo y aparece con su progreso", async ({ page }) => {
    await page.goto("/stats");

    await expect(page.getByRole("heading", { name: "Estadísticas y objetivos" })).toBeVisible();

    await page.getByLabel("Desde").fill("2026-01-01");
    await page.getByLabel("Hasta").fill("2026-12-31");
    await page.getByLabel("Palabras objetivo").fill("5000");
    await page.getByRole("button", { name: "Guardar objetivo" }).click();

    await expect(page.getByText("Objetivo guardado.")).toBeVisible();
    await expect(page.getByText(/de 5000 palabras/)).toBeVisible();
  });

  test("las estadísticas muestran las palabras escritas", async ({ page }) => {
    await page.goto("/stats");

    await expect(page.getByText("Palabras escritas", { exact: true })).toBeVisible();
    await expect(page.getByText("Días con escritura", { exact: true })).toBeVisible();
    await expect(page.getByText("Objetivos activos", { exact: true })).toBeVisible();
  });

  test("las preferencias de escritura se ajustan y se recuerdan", async ({ page }) => {
    await page.goto("/stats");

    const size = page.getByLabel(/Tamaño del texto/);
    await expect(size).toBeVisible();

    // El control guarda las preferencias en el navegador, de modo que solo
    // funcionan cuando la página está hidratada. Se reintenta el ajuste
    // hasta que el valor queda guardado de verdad.
    await expect
      .poll(
        async () => {
          await size.fill("22");
          return page.evaluate(() =>
            window.localStorage.getItem("escribiendo-writing-preferences"),
          );
        },
        // La hidratación puede tardar más cuando la suite entera acaba de
        // compilar y el equipo está cargado.
        { timeout: 15_000 },
      )
      .toContain('"fontSize":22');

    await page.reload();

    await expect(page.getByLabel(/Tamaño del texto/)).toHaveValue("22");
  });

  test("un comentario se publica y aparece sin resolver", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Revisión", exact: true })
      .click();

    await expect(page.getByRole("heading", { name: "Revisión editorial" })).toBeVisible();

    await page
      .getByRole("textbox", { name: "Comentario" })
      .fill("Conviene ajustar la transición de la escena.");
    await page.getByRole("button", { name: "Publicar comentario" }).click();

    await expect(page.getByText("Comentario publicado.")).toBeVisible();
    await expect(page.getByText("Conviene ajustar la transición de la escena.")).toBeVisible();
  });

  test("un comentario se resuelve y pasa al historial", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Revisión", exact: true })
      .click();

    await page.getByRole("button", { name: "Resolver" }).first().click();

    await expect(page.getByText("Comentario resuelto.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Resueltos/ })).toBeVisible();
  });

  test("el libro se envía a revisión y se aprueba sin comentarios abiertos", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();

    // Desde «Borrador» el libro pasa primero a «En escritura».
    await page.getByLabel("Nuevo estado").selectOption("IN_PROGRESS");
    await page.getByRole("button", { name: "Cambiar estado" }).click();
    await expect(page.getByText("Estado actualizado.")).toBeVisible();

    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Revisión", exact: true })
      .click();

    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await expect(page.getByText("Libro enviado a revisión.")).toBeVisible();

    await page.getByRole("button", { name: "Aprobar el libro" }).click();

    await expect(page.getByText("Libro aprobado.")).toBeVisible();
  });

  test("el historial muestra dos revisiones y permite compararlas", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("La primera versión del texto.");
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Y una frase añadida en la segunda versión.");
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    await page.getByRole("link", { name: "Historial y comparador" }).click();

    await expect(page.getByRole("heading", { name: /Historial de/ })).toBeVisible();
    await expect(page.getByText("Comparación")).toBeVisible();

    // Elige la revisión más antigua como punto de partida.
    await page.locator("ol li a").last().click();

    await expect(page.getByText(/De la versión/)).toBeVisible();
  });
});
