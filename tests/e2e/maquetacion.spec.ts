import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { auditar, resume } from "./support/axe";

/**
 * Maquetación: plantillas con geometría predeterminada, perfiles avanzados,
 * vista previa paginada y diagnóstico de composición.
 *
 * El archivo es autocontenido: crea su propio libro y su propia sección, de
 * modo que pueda ejecutarse en solitario. Se llama «maquetacion» y no
 * «layout» porque los archivos se ejecutan por orden alfabético y el de la
 * biblioteca necesita empezar con la biblioteca vacía.
 */
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = `Manual de maquetación ${randomUUID()}`;
const PROFILE_TITLE = `A5 de trabajo ${randomUUID()}`;
const RENAMED_PROFILE_TITLE = `A5 revisado ${randomUUID()}`;
const SECTION_TITLE = "Capítulo de prueba";

/** Abre la maquetación del libro creado por la primera prueba. */
async function openLayout(page: Page): Promise<void> {
  await page.goto("/books");
  await page.getByRole("link", { name: BOOK_TITLE }).click();
  await page
    .getByRole("navigation", { name: "Acciones del libro" })
    .getByRole("link", { name: "Maquetación" })
    .click();
  await expect(page.getByRole("heading", { name: "Maquetación" })).toBeVisible();
}

/** Abre el bloque de perfiles si está cerrado. */
async function openAdvancedProfiles(page: Page): Promise<void> {
  const details = page
    .locator("details")
    .filter({ has: page.getByRole("heading", { name: "Perfiles de página" }) });

  if ((await details.getAttribute("open")) === null) {
    await details.locator("summary").click();
  }

  await expect(page.getByRole("link", { name: "Nuevo perfil" })).toBeVisible();
}

test.describe("Maquetación", () => {
  test("se crea un libro y una sección para maquetar", async ({ page }) => {
    await page.goto("/books/new");

    await page.getByLabel("Título", { exact: true }).fill(BOOK_TITLE);
    await page.getByLabel("Autoría").fill("Ana Torres");
    await page.getByRole("button", { name: "Crear libro" }).click();

    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();

    await page.getByLabel("Título de la sección").fill(SECTION_TITLE);
    await page.getByLabel("Tipo").selectOption("CHAPTER");
    await page.getByRole("button", { name: "Añadir sección" }).click();

    await expect(page.getByRole("heading", { name: SECTION_TITLE })).toBeVisible();
  });

  test("la maquetación se elige solo con la plantilla", async ({ page }) => {
    await openLayout(page);

    await expect(page.getByRole("heading", { name: "Elige una plantilla" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Novela/ })).toBeVisible();
    await expect(page.getByText("Márgenes (sup./inf./int./ext.): 20/20/18/14 mm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar plantilla" })).toBeVisible();

    // La geometría no se pide en el flujo principal.
    await expect(page.getByLabel("Perfil de página")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Aplicar maqueta" })).toHaveCount(0);

    // Los perfiles siguen disponibles, pero como ajuste avanzado cerrado.
    await expect(page.getByText("Ajustes avanzados", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nuevo perfil" })).not.toBeVisible();
  });

  test("un perfil de página se crea con su geometría en los ajustes avanzados", async ({
    page,
  }) => {
    await openLayout(page);
    await openAdvancedProfiles(page);

    await page.getByRole("link", { name: "Nuevo perfil" }).click();

    await expect(page.getByRole("heading", { name: "Nuevo perfil de página" })).toBeVisible();

    await page.getByLabel("Nombre del perfil").fill(PROFILE_TITLE);
    await page.getByLabel("Formato").selectOption("A5");
    await page.getByLabel("Margen superior").fill("20");
    await page.getByLabel("Margen inferior").fill("20");
    await page.getByLabel("Margen interior").fill("18");
    await page.getByLabel("Margen exterior").fill("14");
    await page.getByLabel("Distancia del encabezado").fill("10");
    await page.getByLabel("Distancia del pie").fill("10");
    await page.getByRole("button", { name: "Crear perfil" }).click();

    await expect(page.getByText("Perfil de página guardado.")).toBeVisible();

    await openAdvancedProfiles(page);
    await expect(page.getByRole("heading", { name: PROFILE_TITLE })).toBeVisible();
  });

  test("una geometría imposible se rechaza con un motivo claro", async ({ page }) => {
    await openLayout(page);
    await openAdvancedProfiles(page);

    await page.getByRole("link", { name: "Nuevo perfil" }).click();

    await page.getByLabel("Nombre del perfil").fill("Perfil imposible");
    await page.getByLabel("Ancho de página").fill("148");
    await page.getByLabel("Alto de página").fill("210");
    // Los márgenes laterales se comen toda la caja de texto.
    await page.getByLabel("Margen superior").fill("20");
    await page.getByLabel("Margen inferior").fill("20");
    await page.getByLabel("Margen interior").fill("100");
    await page.getByLabel("Margen exterior").fill("100");
    await page.getByRole("button", { name: "Crear perfil" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: "consumen todo el ancho" }),
    ).toBeVisible();
  });

  test("el perfil creado se puede editar", async ({ page }) => {
    await openLayout(page);
    await openAdvancedProfiles(page);

    // La lista puede contener más de un perfil: se busca el propio.
    await page
      .getByRole("listitem")
      .filter({ hasText: PROFILE_TITLE })
      .getByRole("link", { name: "Editar" })
      .click();

    await expect(page.getByRole("heading", { name: PROFILE_TITLE })).toBeVisible();

    await page.getByLabel("Nombre del perfil").fill(RENAMED_PROFILE_TITLE);
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByText("Perfil de página actualizado.")).toBeVisible();
  });

  test("se aplica la plantilla al libro", async ({ page }) => {
    await openLayout(page);

    await page.getByRole("radio", { name: /Novela/ }).check();
    await page.getByRole("button", { name: "Aplicar plantilla" }).click();

    await expect(page.getByText("Plantilla aplicada al libro.")).toBeVisible();
    await expect(page.getByText(/La edición actual usa la plantilla «Novela»/)).toBeVisible();
  });

  test("la vista previa paginada compone las páginas del manuscrito", async ({ page }) => {
    // Se escribe algo en la sección para que haya páginas que componer.
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type(
      "El velo de la tarde caía sobre la plaza mientras el reloj de la iglesia marcaba las siete y media de la tarde.",
    );
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();
    await expect(page.getByText("página", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/con la plantilla «Novela»/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Problemas de composición" })).toBeVisible();
    // Las fuentes están en el repositorio: la vista previa debe usar las
    // métricas reales, no el modelo aproximado de anchos medios.
    await expect(page.getByText(/métricas reales de la fuente/)).toBeVisible();
  });

  test("la vista previa no esconde el final del capítulo anterior", async ({ page }) => {
    // Un capítulo que llena varias páginas: al abrir el capítulo siguiente
    // hay que cerrar la página en curso **con su contenido**. Antes esa
    // página se marcaba en blanco y la vista previa ocultaba el texto, aunque
    // el PDF lo dibujara.
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.insertText(
      `${"El velo de la tarde caía sobre la plaza mientras el reloj marcaba las siete. ".repeat(120)}FINALDELCAPITULO`,
    );
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    // Un segundo capítulo, que obliga a cerrar la página en curso.
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByLabel("Título de la sección").fill("Segundo capítulo");
    await page.getByLabel("Tipo").selectOption("CHAPTER");
    await page.getByRole("button", { name: "Añadir sección" }).click();
    await expect(page.getByRole("heading", { name: "Segundo capítulo" })).toBeVisible();

    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();
    // El final del primer capítulo se ve: es el texto de la página que se
    // cierra al abrir el capítulo siguiente.
    await expect(page.getByText("FINALDELCAPITULO").first()).toBeVisible();
  });

  test("la vista previa muestra el folio y el encabezado de página", async ({ page }) => {
    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();
    await expect(page.getByText(/folio 1/)).toBeVisible();
    await expect(page.getByText(SECTION_TITLE).first()).toBeVisible();
  });

  test("la vista previa no tiene infracciones de accesibilidad graves", async ({ page }) => {
    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();

    const resultado = await auditar(page);

    expect(resume(resultado.graves, "vista previa")).toEqual([]);
  });

  test("la página se dibuja a escala real y respeta los márgenes", async ({ page }) => {
    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();

    const medida = await page.evaluate(() => {
      const hoja = document.querySelector<HTMLElement>('[aria-label="Página 1"]');

      if (!hoja) {
        return null;
      }

      const cajaHoja = hoja.getBoundingClientRect();
      const texto = hoja.querySelector<HTMLElement>("[data-page-text]");
      const cajaTexto = texto?.getBoundingClientRect();
      const encabezado = Array.from(
        document.querySelectorAll<HTMLElement>("[data-page-running-head]"),
      ).find((elemento) => elemento.textContent?.includes("Capítulo de prueba"));
      const cajaEncabezado = encabezado?.getBoundingClientRect();
      const hojaEncabezado = encabezado?.closest<HTMLElement>('[aria-label^="Página "]');
      const cajaHojaEncabezado = hojaEncabezado?.getBoundingClientRect();
      const encabezadoEnApertura = hoja.querySelector("[data-page-running-head]");

      return {
        ancho: cajaHoja.width,
        alto: cajaHoja.height,
        texto: cajaTexto
          ? {
              arriba: cajaTexto.top - cajaHoja.top,
              ancho: cajaTexto.width,
            }
          : null,
        encabezado:
          cajaEncabezado && cajaHojaEncabezado
            ? {
                arriba:
                  cajaEncabezado.top - cajaHojaEncabezado.top - (hojaEncabezado?.clientTop ?? 0),
              }
            : null,
        encabezadoEnApertura: Boolean(encabezadoEnApertura),
      };
    });

    expect(medida).not.toBeNull();

    // Un milímetro del perfil es un milímetro en pantalla (96 dpi), con un
    // píxel de tolerancia por el borde de la hoja.
    const pxPorMm = 96 / 25.4;
    const tolerancia = 1.5;

    expect(Math.abs((medida?.ancho ?? 0) - 148 * pxPorMm)).toBeLessThanOrEqual(tolerancia);
    expect(Math.abs((medida?.alto ?? 0) - 210 * pxPorMm)).toBeLessThanOrEqual(tolerancia);

    expect(medida?.texto).not.toBeNull();
    // Margen superior de 20 mm y ancho del área de texto: 148 − 18 − 14.
    expect(Math.abs((medida?.texto?.arriba ?? 0) - 20 * pxPorMm)).toBeLessThanOrEqual(tolerancia);
    expect(Math.abs((medida?.texto?.ancho ?? 0) - (148 - 18 - 14) * pxPorMm)).toBeLessThanOrEqual(
      tolerancia,
    );

    // El encabezado de página está a 10 mm del borde superior en las páginas
    // de continuación. La página que abre capítulo no lo repite.
    expect(medida?.encabezado).not.toBeNull();
    expect(Math.abs((medida?.encabezado?.arriba ?? 0) - 10 * pxPorMm)).toBeLessThanOrEqual(
      tolerancia,
    );
    expect(medida?.encabezadoEnApertura).toBe(false);
  });

  test("el título editorial se renombra y muestra tipo y número", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    await page.getByRole("tab", { name: "Detalles", exact: true }).click();
    await page.getByLabel("Título en el libro").fill("El despertar");
    const reopen = page.getByRole("button", { name: "Mostrar panel editorial", exact: true });
    if (await reopen.isVisible()) await reopen.click();
    await page.getByRole("tab", { name: "Detalles", exact: true }).click();
    await page.getByLabel("Tipo de sección", { exact: true }).check();
    await page.getByLabel("Número", { exact: true }).check();
    await page.getByRole("button", { name: "Guardar título" }).click();

    await expect(page.getByText(/Titulo actualizado/)).toBeVisible();

    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();
    await expect(page.getByText("Capítulo 1 — El despertar").first()).toBeVisible();
  });

  test("ocultar el título no rompe el índice ni el encabezado", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: "El despertar" }).click();

    await page.getByRole("tab", { name: "Detalles", exact: true }).click();
    await page.getByLabel("Título", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Guardar título" }).click();
    await expect(page.getByText(/Titulo actualizado/)).toBeVisible();

    await openLayout(page);
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    const paginas = page.getByRole("region", { name: "páginas" });
    const titles = paginas.locator('[data-block-kind="title"], [data-block-kind="chapterTitle"]');
    await expect(titles.filter({ hasText: "El despertar" })).toHaveCount(0);
    await expect(titles.filter({ hasText: "Segundo capítulo" })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "índice" })).toContainText("El despertar");
  });
});
