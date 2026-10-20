import { expect, test } from "@playwright/test";

/**
 * Maquetación: perfiles de página, plantillas, vista previa paginada y
 * diagnóstico de composición.
 *
 * El archivo es autocontenido: crea su propio libro y su propia sección, de
 * modo que pueda ejecutarse en solitario. Se llama «maquetacion» y no
 * «layout» porque los archivos se ejecutan por orden alfabético y el de la
 * biblioteca necesita empezar con la biblioteca vacía.
 */
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = "Manual de maquetación";
const SECTION_TITLE = "Capítulo de prueba";

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

  test("la maquetación ofrece crear un perfil de página", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();

    await expect(page.getByRole("heading", { name: "Maquetación" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Geometrías del estudio" })).toBeVisible();
  });

  test("un perfil de página se crea con su geometría", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();

    await page.getByRole("link", { name: "Nuevo perfil" }).click();

    await expect(page.getByRole("heading", { name: "Nuevo perfil de página" })).toBeVisible();

    await page.getByLabel("Nombre del perfil").fill("A5 de trabajo");
    await page.getByLabel("Formato").selectOption("A5");
    await page.getByLabel("Margen superior").fill("20");
    await page.getByLabel("Margen inferior").fill("20");
    await page.getByLabel("Margen interior").fill("18");
    await page.getByLabel("Margen exterior").fill("14");
    await page.getByLabel("Distancia del encabezado").fill("10");
    await page.getByLabel("Distancia del pie").fill("10");
    await page.getByRole("button", { name: "Crear perfil" }).click();

    await expect(page.getByText("Perfil de página guardado.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "A5 de trabajo" })).toBeVisible();
  });

  test("una geometría imposible se rechaza con un motivo claro", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();

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
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();

    // La lista puede contener más de un perfil: se busca el propio.
    await page
      .getByRole("listitem")
      .filter({ hasText: "A5 de trabajo" })
      .getByRole("link", { name: "Editar" })
      .click();

    await expect(page.getByRole("heading", { name: "A5 de trabajo" })).toBeVisible();

    await page.getByLabel("Nombre del perfil").fill("A5 revisado");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByText("Perfil de página actualizado.")).toBeVisible();
  });

  test("se aplica la maqueta al libro", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();

    await page.getByLabel("Perfil de página").selectOption({ label: "A5 revisado (148 × 210 mm)" });
    await page.getByRole("button", { name: "Aplicar maqueta" }).click();

    await expect(page.getByText("Maqueta aplicada al libro.")).toBeVisible();
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
    await expect(page.getByText("Manuscrito guardado.")).toBeVisible();

    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();
    await expect(page.getByText("página", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Problemas de composición" })).toBeVisible();
  });

  test("la vista previa muestra el folio y el encabezado de página", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();
    await expect(page.getByText(/folio 1/)).toBeVisible();
    await expect(page.getByText(SECTION_TITLE).first()).toBeVisible();
  });

  test("la página se dibuja a escala real y respeta los márgenes", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();

    await expect(page.getByRole("heading", { name: "Vista previa paginada" })).toBeVisible();

    const medida = await page.evaluate(() => {
      const hoja = document.querySelector<HTMLElement>('[aria-label^="Página "]');

      if (!hoja) {
        return null;
      }

      const cajaHoja = hoja.getBoundingClientRect();

      return {
        ancho: cajaHoja.width,
        alto: cajaHoja.height,
        hijos: Array.from(hoja.children).map((hijo) => {
          const caja = hijo.getBoundingClientRect();
          return {
            texto: (hijo.textContent ?? "").slice(0, 40),
            arriba: caja.top - cajaHoja.top,
            izquierda: caja.left - cajaHoja.left,
            ancho: caja.width,
          };
        }),
      };
    });

    expect(medida).not.toBeNull();

    // Un milímetro del perfil es un milímetro en pantalla (96 dpi), con un
    // píxel de tolerancia por el borde de la hoja.
    const pxPorMm = 96 / 25.4;
    const tolerancia = 1.5;

    expect(Math.abs((medida?.ancho ?? 0) - 148 * pxPorMm)).toBeLessThanOrEqual(tolerancia);
    expect(Math.abs((medida?.alto ?? 0) - 210 * pxPorMm)).toBeLessThanOrEqual(tolerancia);

    const texto = medida?.hijos.find((hijo) => hijo.texto.includes("El velo de la tarde caía"));
    const encabezado = medida?.hijos.find((hijo) => hijo.texto.includes(SECTION_TITLE));

    expect(texto).toBeDefined();
    // Margen superior de 20 mm y ancho del área de texto: 148 − 18 − 14.
    expect(Math.abs((texto?.arriba ?? 0) - 20 * pxPorMm)).toBeLessThanOrEqual(tolerancia);
    expect(Math.abs((texto?.ancho ?? 0) - (148 - 18 - 14) * pxPorMm)).toBeLessThanOrEqual(
      tolerancia,
    );

    // El encabezado de página está a 10 mm del borde superior.
    expect(encabezado).toBeDefined();
    expect(Math.abs((encabezado?.arriba ?? 0) - 10 * pxPorMm)).toBeLessThanOrEqual(tolerancia);
  });
});
