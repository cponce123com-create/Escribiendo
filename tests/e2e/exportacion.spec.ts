import { expect, test, type Download } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

/**
 * Exportación: generación de archivos, idempotencia de la cola y descarga
 * firmada.
 *
 * El archivo es autocontenido: crea su propio libro, su propia sección y
 * aplica su propia plantilla, de modo que pueda ejecutarse en solitario.
 */
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = "Libro exportable";
const SECTION_TITLE = "Prólogo exportable";

function unicodeFromHex(hex: string): string {
  const puntos: number[] = [];

  for (let index = 0; index < hex.length; index += 4) {
    puntos.push(Number.parseInt(hex.slice(index, index + 4), 16));
  }

  return String.fromCodePoint(...puntos);
}

/**
 * Despliega los flujos comprimidos del PDF.
 *
 * Los flujos van con `FlateDecode`. La prueba analiza el contenido real del
 * archivo, así que primero los despliega. El programa de la fuente se
 * descarta: es binario y no aporta nada a la comprobación.
 */
function descomprimirFlujos(pdf: string): string {
  const patron = /(\d+) 0 obj\s*<<([^>]*?)\/Filter \/FlateDecode([^>]*?)>>\s*stream\n/gu;
  let salida = "";
  let ultimo = 0;
  let match: RegExpExecArray | null;

  while ((match = patron.exec(pdf)) !== null) {
    const inicio = match.index + match[0].length;
    const fin = pdf.indexOf("\nendstream", inicio);

    if (fin < 0) {
      break;
    }

    const esFuente = match[2]!.includes("/Length1");
    const plano = esFuente
      ? ""
      : inflateSync(Buffer.from(pdf.slice(inicio, fin), "latin1")).toString("latin1");

    salida += pdf.slice(ultimo, match.index) + match[0] + plano;
    ultimo = fin;
  }

  return salida + pdf.slice(ultimo);
}

/**
 * Extrae el texto de los flujos `Identity-H` usando los mapas `ToUnicode`
 * incrustados. No es un lector PDF general: sirve para comprobar que los CIDs
 * del archivo vuelven a ser el texto que escribió la autora.
 */
function extractPdfText(pdf: string): string {
  const cmaps = new Map<string, Map<number, string>>();

  for (const match of pdf.matchAll(
    /(\d+) 0 obj\s*<< \/Length \d+( \/Filter \/FlateDecode)? >>\s*stream\n([\s\S]*?)\nendstream/gu,
  )) {
    if (!match[3]!.includes("beginbfchar")) {
      continue;
    }

    const map = new Map<number, string>();

    for (const entry of match[3]!.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/gu)) {
      map.set(Number.parseInt(entry[1]!, 16), unicodeFromHex(entry[2]!));
    }

    cmaps.set(match[1]!, map);
  }

  const type0 = new Map<string, string>();

  for (const match of pdf.matchAll(/(\d+) 0 obj\s*<<([\s\S]*?)>>\s*endobj/gu)) {
    if (!match[2]!.includes("/Subtype /Type0")) {
      continue;
    }

    const toUnicode = match[2]!.match(/\/ToUnicode (\d+) 0 R/u);

    if (toUnicode) {
      type0.set(match[1]!, toUnicode[1]!);
    }
  }

  const resources = new Map<string, Map<number, string>>();

  for (const match of pdf.matchAll(/\/(E\d+) (\d+) 0 R/gu)) {
    const cmap = type0.get(match[2]!);

    if (cmap && cmaps.has(cmap)) {
      resources.set(match[1]!, cmaps.get(cmap)!);
    }
  }

  let text = "";

  for (const block of pdf.matchAll(/\bBT ([\s\S]*?) ET/gu)) {
    const font = block[1]!.match(/^\/(E\d+) /u);

    if (!font) {
      continue;
    }

    const cmap = resources.get(font[1]!);

    if (!cmap) {
      continue;
    }

    const hexadecimales = [...block[1]!.matchAll(/<([0-9A-Fa-f]+)>/gu)].map((match) => match[1]!);

    for (const hexadecimal of hexadecimales) {
      for (let index = 0; index < hexadecimal.length; index += 4) {
        const cid = Number.parseInt(hexadecimal.slice(index, index + 4), 16);
        text += cmap.get(cid) ?? "?";
      }
    }
  }

  return text;
}

/**
 * Valida el EPUB con EPUBCheck, la herramienta oficial del W3C.
 *
 * Necesita Java, así que solo se usa cuando se indica dónde está
 * `epubcheck.jar`. Si no está configurado, se devuelve `null` y la prueba
 * sigue con la comprobación estructural; si está configurado y falla, la
 * prueba falla. Nunca se declara una validación que no se ha hecho.
 */
function validarConEpubCheck(ruta: string): { codigo: number; salida: string } | null {
  const jar = process.env.EPUBCHECK_JAR;

  if (!jar) {
    return null;
  }

  const java = process.env.JAVA ?? "java";
  // EPUBCheck decide el modo de validación por la extensión, así que el
  // archivo descargado (que Playwright guarda con un nombre temporal) se
  // copia con extensión `.epub` antes de validarlo.
  const copia = path.join(tmpdir(), `escribiendo-${randomUUID()}.epub`);

  copyFileSync(ruta, copia);

  const resultado = spawnSync(java, ["-jar", jar, copia], { encoding: "utf8" });

  if (resultado.error) {
    throw new Error(`No se ha podido ejecutar EPUBCheck: ${resultado.error.message}`);
  }

  return {
    codigo: resultado.status ?? 1,
    salida: `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`,
  };
}

/**
 * Guarda el archivo descargado en `test-results` para poder validarlo con
 * herramientas externas fuera del proceso de pruebas.
 */
async function guardarParaValidacion(descarga: Download, nombre: string): Promise<string> {
  const destino = path.join(process.cwd(), "test-results", nombre);

  mkdirSync(path.dirname(destino), { recursive: true });
  await descarga.saveAs(destino);

  return destino;
}

test.describe("Exportación", () => {
  test("se crea un libro con una sección para exportar", async ({ page }) => {
    await page.goto("/books/new");

    await page.getByLabel("Título", { exact: true }).fill(BOOK_TITLE);
    await page.getByLabel("Autoría").fill("Ana Torres");
    await page.getByRole("button", { name: "Crear libro" }).click();

    await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();

    await page.getByLabel("Título de la sección").fill(SECTION_TITLE);
    await page.getByLabel("Tipo").selectOption("CHAPTER");
    await page.getByRole("button", { name: "Añadir sección" }).click();

    await expect(page.getByRole("heading", { name: SECTION_TITLE })).toBeVisible();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("Caía la tarde sobre la plaza cuando ");
    await page.keyboard.press("Control+b");
    await page.keyboard.type("Marta");
    await page.keyboard.press("Control+b");
    await page.keyboard.type(" cerró la puerta de la librería.");
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();
  });

  test("sin maquetación, el PDF no se puede generar y se explica", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await expect(page.getByRole("heading", { name: "Exportación" })).toBeVisible();

    const generar = page
      .getByRole("listitem")
      .filter({ hasText: "PDF digital" })
      .getByRole("button", { name: "Generar" });

    await expect(generar).toBeDisabled();
    await expect(page.getByText(/necesita una plantilla de maquetación/).first()).toBeVisible();
  });

  test("se aplica una plantilla para poder componer el PDF", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();

    // Manual trae 3 mm de sangrado, que la prueba del PDF de imprenta necesita.
    await page.getByRole("radio", { name: /Manual/ }).check();
    await page.getByRole("button", { name: "Aplicar plantilla" }).click();

    await expect(page.getByText("Plantilla aplicada al libro.")).toBeVisible();
  });

  test("el PDF digital se genera y se descarga", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "PDF digital" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/u);

    const ruta = await download.path();

    if (!ruta) {
      throw new Error("No se ha descargado el archivo.");
    }

    const bytes = readFileSync(ruta);

    expect(bytes.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
    expect(bytes.subarray(bytes.length - 6).toString("utf8")).toContain("%%EOF");

    // El archivo se guarda para poder abrirlo con un lector externo
    // (por ejemplo, `node scripts/pdfjs/valida-pdf.mjs`) fuera del proceso de
    // pruebas.
    await guardarParaValidacion(download, "pdf-generado.pdf");

    // La palabra en negrita se dibuja con una cara TTF incrustada, no con la
    // fuente estándar ni con la redonda. El texto viaja como CIDs, por lo que
    // ya no aparece como una cadena literal en el flujo.
    const texto = bytes.toString("latin1");
    const pagina = descomprimirFlujos(texto);

    expect(texto).toContain("/Subtype /Type0");
    expect(texto).toContain("/Subtype /CIDFontType2");
    expect(texto).toContain("/FontFile2");
    expect(texto).toContain("/ToUnicode");
    expect(texto).toContain("/BaseFont /LiberationSans-Bold");
    expect(pagina).toMatch(/BT \/E\d+ [\d.]+ Tf/u);
    expect(pagina).not.toContain("Marta) Tj");
  });

  test("el PDF respeta la visualización del tipo y el número del título", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    await page.getByLabel("Tipo de sección", { exact: true }).check();
    await page.getByLabel("Número", { exact: true }).check();
    await page.getByRole("button", { name: "Guardar título" }).click();
    await expect(page.getByText(/Titulo actualizado/)).toBeVisible();

    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Maquetación" })
      .click();
    await page.getByRole("link", { name: "Ver la vista previa paginada" }).click();
    const resumen = await page.getByText(/\d+ páginas con la plantilla/).innerText();
    const paginasVistaPrevia = Number(resumen.match(/(\d+) páginas/u)?.[1]);

    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "PDF digital" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar" }).click(),
    ]);
    const ruta = await download.path();

    if (!ruta) {
      throw new Error("No se ha descargado el archivo.");
    }

    const contenido = readFileSync(ruta).toString("latin1");
    const extraido = extractPdfText(descomprimirFlujos(contenido));

    expect(extraido).toContain("Capítulo 1");
    expect(extraido).toContain(SECTION_TITLE);
    // El título se inserta una sola vez: el manuscrito no empieza con un
    // encabezado equivalente.
    expect(extraido.match(new RegExp(SECTION_TITLE, "gu"))?.length ?? 0).toBe(1);

    // El PDF y la vista previa cuentan las mismas páginas y el archivo lleva
    // los marcadores de navegación de las secciones visibles.
    const paginasPdf = Number(contenido.match(/\/Type \/Pages \/Count (\d+)/u)?.[1]);
    expect(paginasPdf).toBe(paginasVistaPrevia);
    expect(contenido).toContain("/Outlines");
    expect(contenido).toContain("/PageMode /UseOutlines");
  });

  test("el PDF de imprenta lleva sangrado y marcas de corte", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "PDF de imprenta" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar" }).click(),
    ]);

    const ruta = await download.path();

    if (!ruta) {
      throw new Error("No se ha descargado el archivo.");
    }

    const contenido = readFileSync(ruta).toString("latin1");

    expect(contenido).toContain("/CropBox");
    expect(contenido).toContain("/BleedBox");
    expect(contenido).toContain("/TrimBox");
    // Las marcas de corte son líneas dibujadas fuera de la caja acabada. Van
    // en el flujo de la página, que está comprimido.
    const pagina = descomprimirFlujos(contenido);

    expect(pagina).toContain(" m ");
    expect(pagina).toContain(" l S");
  });

  test("el EPUB se genera y se descarga", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "EPUB 3" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const descarga = page.getByRole("link", { name: "Descargar" });
    await expect(descarga).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), descarga.click()]);

    expect(download.suggestedFilename()).toMatch(/\.epub$/u);
  });

  test("el archivo descargado es un EPUB válido", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "EPUB 3" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar" }).click(),
    ]);

    const ruta = await download.path();

    if (!ruta) {
      throw new Error("No se ha descargado el archivo.");
    }

    const bytes = readFileSync(ruta);

    // Firma ZIP y entrada `mimetype` la primera, como exige EPUB 3.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.subarray(30, 38).toString("utf8")).toBe("mimetype");
    expect(bytes.subarray(38, 58).toString("utf8")).toBe("application/epub+zip");

    // Validación externa con EPUBCheck, si la herramienta está configurada.
    const epubcheck = validarConEpubCheck(ruta);

    if (epubcheck) {
      await test.info().attach("epubcheck.txt", {
        body: epubcheck.salida,
        contentType: "text/plain",
      });
      process.stdout.write(
        `[epubcheck] ${epubcheck.salida.replace(/\s+/gu, " ").trim().slice(0, 1500)}\n`,
      );

      expect(epubcheck.codigo).toBe(0);
      expect(epubcheck.salida).toContain("0 errores");
    } else {
      test.info().annotations.push({
        type: "note",
        description: "EPUBCheck no configurado: la validación externa se ha omitido.",
      });
    }
  });

  test("pedir dos veces la misma exportación reutiliza el trabajo", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    const generar = page
      .getByRole("listitem")
      .filter({ hasText: "DOCX" })
      .getByRole("button", { name: "Generar" });

    await generar.click();
    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const antes = await page.getByRole("listitem").filter({ hasText: "DOCX" }).count();

    await generar.click();
    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const despues = await page.getByRole("listitem").filter({ hasText: "DOCX" }).count();

    // La cola es idempotente: el mismo manuscrito no genera un trabajo nuevo.
    expect(despues).toBe(antes);
  });

  test("el DOCX generado es un paquete de Word", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "DOCX" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar" }).click(),
    ]);

    const ruta = await download.path();

    if (!ruta) {
      throw new Error("No se ha descargado el archivo.");
    }

    const bytes = readFileSync(ruta);

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.subarray(30, 49).toString("utf8")).toBe("[Content_Types].xml");

    // El archivo se guarda para poder abrirlo con un lector externo
    // (por ejemplo, `pnpm dlx mammoth@1.11.0`) fuera del proceso de pruebas.
    await guardarParaValidacion(download, "docx-generado.docx");
  });

  test("el PDF conserva la tipografía española", async ({ page }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page.getByRole("link", { name: SECTION_TITLE }).click();

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("«Cita» — con rayas… y eñes: niño, caía, miró.");
    await page.getByRole("button", { name: "Guardar manuscrito" }).click();
    await expect(page.getByText("Guardado en el servidor.")).toBeVisible();

    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "PDF digital" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    // El PDF no debe avisar de caracteres perdidos: los signos españoles
    // tienen representación en la fuente estándar.
    await expect(
      page.getByRole("alert").filter({ hasText: "no ha podido representar" }),
    ).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar" }).click(),
    ]);

    const ruta = await download.path();

    if (!ruta) {
      throw new Error("No se ha descargado el archivo.");
    }

    const contenido = readFileSync(ruta).toString("latin1");

    expect(contenido).toContain("/ToUnicode");

    // Los CIDs se convierten de vuelta a Unicode con el mapa incrustado. Así
    // se comprueba a la vez que el texto se conserva y que se puede buscar o
    // copiar desde un lector PDF.
    const extraido = extractPdfText(descomprimirFlujos(contenido));

    expect(extraido).not.toBe("");
    expect(extraido).toContain("«Cita»");
    expect(extraido).toContain("—");
    expect(extraido).toContain("…");
    expect(extraido).toContain("niño");
    expect(extraido).toContain("caía");
    expect(extraido).toContain("miró");
  });

  test("una descarga sin firma se rechaza", async ({ page, request }) => {
    await page.goto("/books");
    await page.getByRole("link", { name: BOOK_TITLE }).click();
    await page
      .getByRole("navigation", { name: "Acciones del libro" })
      .getByRole("link", { name: "Exportación" })
      .click();

    await page
      .getByRole("listitem")
      .filter({ hasText: "EPUB 3" })
      .getByRole("button", { name: "Generar" })
      .click();

    await expect(page.getByText("Archivo generado.")).toBeVisible();

    const enlace = await page.getByRole("link", { name: "Descargar" }).getAttribute("href");

    if (!enlace) {
      throw new Error("No hay enlace de descarga.");
    }

    const respuesta = await request.get(enlace.replace(/signature=[^&]+/u, "signature=invalida"));

    expect(respuesta.status()).toBe(403);
  });
});
