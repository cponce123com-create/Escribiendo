import { expect, test, type Page } from "@playwright/test";
import { auditar, resume } from "./support/axe";

/**
 * Resiliencia del manuscrito.
 *
 * Comprueba que el texto no se pierde: sin conexión, con el servidor
 * caído, al recargar, al cerrar y volver a abrir, con dos pestañas a la vez
 * o escribiendo mientras hay una petición en curso.
 */
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = "Manuscrito resiliente";
const SECTION_TITLE = "Capítulo de pruebas";

/** Espera a que el editor esté listo. */
async function abrirSeccion(page: Page, titulo: string): Promise<void> {
  await page.goto("/books");
  await page.getByRole("link", { name: BOOK_TITLE }).click();
  await page.getByRole("link", { name: titulo }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

/** Texto que hay ahora mismo en el editor. */
async function textoDelEditor(page: Page): Promise<string> {
  return (await page.locator(".ProseMirror").innerText()).trim();
}

test.describe("Resiliencia del manuscrito", () => {
  test("se crea un libro y una sección", async ({ page }) => {
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

  test("el panel editorial se retrae, amplía el editor y recuerda su estado", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    const panel = page.getByRole("complementary", { name: "Panel editorial" });
    const editor = page.locator(".studio-writing-column");
    const anchoAbierto = (await editor.boundingBox())?.width ?? 0;

    await panel.getByRole("button", { name: "Ocultar panel editorial" }).click();

    await expect(panel).toHaveAttribute("data-collapsed", "true");
    await expect(panel.getByRole("button", { name: "Mostrar panel editorial" })).toBeVisible();
    expect((await editor.boundingBox())?.width ?? 0).toBeGreaterThan(anchoAbierto);

    await page.reload();
    const panelTrasRecarga = page.getByRole("complementary", { name: "Panel editorial" });
    await expect(panelTrasRecarga).toHaveAttribute("data-collapsed", "true");
    await panelTrasRecarga.getByRole("button", { name: "Mostrar panel editorial" }).click();
    await expect(panelTrasRecarga).toHaveAttribute("data-collapsed", "false");
  });

  test("la barra refleja el formato activo y habilita el historial cuando corresponde", async ({
    page,
  }) => {
    await abrirSeccion(page, SECTION_TITLE);

    const deshacer = page.getByRole("button", { name: "Deshacer" });
    const rehacer = page.getByRole("button", { name: "Rehacer" });

    await expect(deshacer).toBeDisabled();
    await expect(rehacer).toBeDisabled();

    const cuerpo = page.locator(".ProseMirror");
    await cuerpo.click();
    await page.keyboard.type("Texto para probar el formato.");
    await page.keyboard.press("Shift+Home");

    const negrita = page.getByRole("button", { name: "Negrita" });
    await negrita.click();
    await expect(negrita).toHaveAttribute("aria-pressed", "true");
    await expect(deshacer).toBeEnabled();

    await deshacer.click();
    await expect(rehacer).toBeEnabled();
    await expect(negrita).toHaveAttribute("aria-pressed", "false");
  });

  test("navega entre capítulos y conserva el orden al reordenarlos", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);
    const navegacion = page.getByRole("complementary", { name: "Navegación del manuscrito" });

    await expect(
      navegacion.getByRole("link", { name: new RegExp(SECTION_TITLE, "u") }),
    ).toHaveAttribute("aria-current", "page");

    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByLabel("Título de la sección").fill("Segundo capítulo de pruebas");
    await page.getByLabel("Tipo").selectOption("CHAPTER");
    await page.getByRole("button", { name: "Añadir sección" }).click();
    await page.getByRole("link", { name: /Segundo capítulo de pruebas/u }).click();

    const nav = page.getByRole("complementary", { name: "Navegación del manuscrito" });
    await nav.getByLabel("Opciones de Segundo capítulo de pruebas").click();
    await nav.getByRole("button", { name: "Subir Segundo capítulo de pruebas" }).click();
    await expect(nav.locator('a[href*="/sections/"]').first()).toContainText(
      "Segundo capítulo de pruebas",
    );
    await nav.getByRole("link", { name: new RegExp(SECTION_TITLE, "u") }).click();
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await expect(page).toHaveURL(new RegExp("/sections/"));
  });

  test("pliega y restaura la navegación del manuscrito", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    const navegacion = page.getByRole("complementary", { name: "Navegación del manuscrito" });
    const ocultar = navegacion.getByRole("button", { name: "Ocultar navegación del manuscrito" });

    await expect(
      navegacion.getByRole("link", { name: new RegExp(SECTION_TITLE, "u") }),
    ).toBeVisible();
    await ocultar.click();

    await expect(navegacion.getByRole("link")).toHaveCount(0);
    await expect(
      navegacion.getByRole("button", { name: "Mostrar navegación del manuscrito" }),
    ).toHaveAttribute("aria-expanded", "false");

    await navegacion.getByRole("button", { name: "Mostrar navegación del manuscrito" }).click();
    await expect(
      navegacion.getByRole("link", { name: new RegExp(SECTION_TITLE, "u") }),
    ).toBeVisible();
  });

  test("pliega el menú principal y recuerda la preferencia", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    const barra = page.getByRole("complementary", { name: "Barra lateral principal" });
    await expect(barra).toBeVisible();
    await page.getByRole("button", { name: "Ocultar menú principal" }).click();
    await expect(barra).toBeHidden();

    await page.reload();
    await expect(page.getByRole("button", { name: "Mostrar menú principal" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await page.getByRole("button", { name: "Mostrar menú principal" }).click();
    await expect(barra).toBeVisible();
  });

  test("el editor ofrece imágenes y la biblioteca del libro", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    await expect(page.getByRole("button", { name: "Insertar imagen" })).toBeVisible();
    await page.getByRole("button", { name: "Biblioteca (0)" }).click();
    await expect(page.getByText("Todavía no hay imágenes en este libro.")).toBeVisible();
  });

  test("el editor y la ficha del libro no tienen infracciones de accesibilidad graves", async ({
    page,
  }) => {
    await abrirSeccion(page, SECTION_TITLE);

    const editor = await auditar(page);
    const graves = [...resume(editor.graves, "editor")];

    // La ficha del libro, con su resumen y sus acciones.
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();

    const ficha = await auditar(page);

    graves.push(...resume(ficha.graves, "ficha del libro"));

    expect(graves).toEqual([]);
  });

  test("inserta y conserva una nota al pie", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Una llamada a nota.");

    // La nota se escribe en un diálogo propio, no en una ventana del navegador.
    await page.locator(".studio-toolbar-more > summary").click();
    await page.getByRole("button", { name: "Nota al pie" }).click();

    const dialogo = page.getByRole("dialog", { name: "Nota al pie" });

    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel("Texto de la nota").fill("Texto comprobado de la nota al pie.");
    await dialogo.getByRole("button", { name: "Insertar nota" }).click();

    await expect(page.getByRole("dialog", { name: "Nota al pie" })).toHaveCount(0);

    const llamada = page.locator("sup.footnote-ref");
    await expect(llamada).toHaveCount(1);
    await expect(llamada).toHaveAttribute("data-number", "1");
    await expect(llamada).toHaveAttribute("title", /Texto comprobado de la nota al pie/u);

    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText(/Guardado en el servidor/)).toBeVisible();

    await page.reload();
    await expect(page.locator("sup.footnote-ref")).toHaveCount(1);
    await expect(page.locator("sup.footnote-ref")).toHaveAttribute("data-number", "1");
  });

  test("inserta un enlace y rechaza un esquema peligroso", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Texto con enlace");
    // Un enlace se aplica a lo que está seleccionado.
    await page.keyboard.press("Shift+Home");

    await page.getByRole("button", { name: "Enlace" }).click();

    const dialogo = page.getByRole("dialog", { name: "Enlace" });

    await expect(dialogo).toBeVisible();

    // Un esquema que ejecuta código no se guarda: el aviso lo explica.
    await dialogo.getByLabel("Dirección del enlace").fill("javascript:alert(1)");
    await expect(dialogo.getByRole("alert")).toContainText(/no se admite/u);

    await dialogo.getByLabel("Dirección del enlace").fill("https://ejemplo.test/libro");
    await dialogo.getByRole("button", { name: "Guardar enlace" }).click();

    await expect(page.getByRole("dialog", { name: "Enlace" })).toHaveCount(0);
    await expect(page.locator('a[href="https://ejemplo.test/libro"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Enlace" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("el texto se guarda en el equipo al momento de escribir", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Primera frase del manuscrito.");

    // El estado muestra que el texto está a salvo en el equipo, no que esté
    // en el servidor.
    await expect(page.getByText(/Guardado en este equipo|Sincronizando/)).toBeVisible();
  });

  test("sin conexión se puede seguir escribiendo y no se pierde el texto", async ({
    page,
    context,
  }) => {
    await abrirSeccion(page, SECTION_TITLE);

    await context.setOffline(true);

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Frase escrita sin conexión.");

    await expect(page.getByText(/Sin conexión/)).toBeVisible();
    await expect(page.getByText(/guardado en este equipo/)).toBeVisible();

    await context.setOffline(false);
  });

  test("con el servidor caído, el texto queda a salvo y se recupera al recargar", async ({
    page,
  }) => {
    await abrirSeccion(page, SECTION_TITLE);

    // El servidor no responde: se abortan las peticiones de guardado.
    await page.route("**/books/**/sections/**", async (ruta) => {
      if (ruta.request().method() === "POST") {
        await ruta.abort();
        return;
      }

      await ruta.fallback();
    });

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Frase que el servidor no va a recibir.");

    await expect(page.getByText(/No se ha podido guardar|Sin conexión/)).toBeVisible();

    // Al recargar, el borrador del equipo se recupera: el texto sigue ahí.
    await page.unroute("**/books/**/sections/**");
    await page.reload();

    await expect(page.locator(".ProseMirror")).toBeVisible();
    await expect(page.getByText("Frase que el servidor no va a recibir.")).toBeVisible();
  });

  test("escribir mientras se guarda no marca el texto como guardado", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    // La petición tarda: durante ese tiempo se escribe algo más.
    await page.route("**/books/**/sections/**", async (ruta) => {
      if (ruta.request().method() === "POST") {
        await new Promise((resolver) => setTimeout(resolver, 2_500));
      }

      await ruta.fallback();
    });

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Frase enviada.");

    await page.getByRole("button", { name: "Guardar manuscrito" }).click();

    // Mientras la petición está en curso se escribe otra frase.
    await page.keyboard.type(" Y una frase escrita durante el envío.");

    // La respuesta del servidor confirma la primera frase, pero la segunda
    // sigue sin guardar: el estado no puede decir que todo está guardado.
    await expect(page.getByText(/Guardado en este equipo|Sincronizando/)).toBeVisible();
    await expect(page.getByText("Guardado en el servidor.")).not.toBeVisible();
  });

  test("dos pestañas sobre la misma sección muestran el conflicto", async ({ context }) => {
    const primera = await context.newPage();
    await abrirSeccion(primera, SECTION_TITLE);

    const segunda = await context.newPage();
    await abrirSeccion(segunda, SECTION_TITLE);

    // La primera pestaña guarda y sube la versión del servidor.
    await primera.locator(".ProseMirror").click();
    await primera.keyboard.type("Texto de la primera pestaña.");
    await primera.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(primera.getByText("Guardado en el servidor.")).toBeVisible();

    // La segunda sigue con la versión anterior: al guardar, el servidor
    // detecta el conflicto y devuelve su versión.
    await segunda.locator(".ProseMirror").click();
    await segunda.keyboard.type("Texto de la segunda pestaña.");
    await segunda.getByRole("button", { name: "Guardar manuscrito" }).click();

    await expect(segunda.getByRole("heading", { name: /dos versiones distintas/ })).toBeVisible();
    await expect(segunda.getByRole("button", { name: "Conservar mi versión" })).toBeVisible();
    await expect(segunda.getByRole("button", { name: "Usar la del servidor" })).toBeVisible();

    // Ninguna de las dos versiones se ha perdido.
    await expect(segunda.getByText(/Texto de la segunda pestaña/)).toBeVisible();

    await primera.close();
    await segunda.close();
  });

  test("el conflicto se puede resolver conservando la versión local", async ({ context }) => {
    const primera = await context.newPage();
    await abrirSeccion(primera, SECTION_TITLE);

    const segunda = await context.newPage();
    await abrirSeccion(segunda, SECTION_TITLE);

    await primera.locator(".ProseMirror").click();
    await primera.keyboard.type("Texto de la primera pestaña.");
    await primera.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(primera.getByText("Guardado en el servidor.")).toBeVisible();

    await segunda.locator(".ProseMirror").click();
    await segunda.keyboard.type("Texto de la segunda pestaña.");
    await segunda.getByRole("button", { name: "Guardar manuscrito" }).click();

    await expect(segunda.getByRole("heading", { name: /dos versiones distintas/ })).toBeVisible();

    await segunda.getByRole("button", { name: "Conservar mi versión" }).click();

    await expect(segunda.getByText("Guardado en el servidor.")).toBeVisible();

    await primera.close();
    await segunda.close();
  });

  test("el texto guardado en el servidor se conserva tras recargar", async ({ page }) => {
    await abrirSeccion(page, SECTION_TITLE);

    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Frase que llega al servidor.");
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();

    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    await page.reload();

    await expect(page.locator(".ProseMirror")).toBeVisible();
    expect((await textoDelEditor(page)).includes("Frase que llega al servidor.")).toBe(true);
  });
});
