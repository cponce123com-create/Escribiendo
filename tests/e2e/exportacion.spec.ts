import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
 * Extrae el texto de los flujos `Identity-H` usando los mapas `ToUnicode`
 * incrustados. No es un lector PDF general: sirve para comprobar que los CIDs
 * del archivo vuelven a ser el texto que escribió la autora.
 */
function extractPdfText(pdf: string): string {
  const cmaps = new Map<string, Map<number, string>>();

  for (const match of pdf.matchAll(
    /(\d+) 0 obj\s*<< \/Length \d+ >>\s*stream\n([\s\S]*?)\nendstream/gu,
  )) {
    if (!match[2]!.includes("beginbfchar")) {
      continue;
    }

    const map = new Map<number, string>();

    for (const entry of match[2]!.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/gu)) {
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

    // La palabra en negrita se dibuja con una cara TTF incrustada, no con la
    // fuente estándar ni con la redonda. El texto viaja como CIDs, por lo que
    // ya no aparece como una cadena literal en el flujo.
    const texto = bytes.toString("latin1");

    expect(texto).toContain("/Subtype /Type0");
    expect(texto).toContain("/Subtype /CIDFontType2");
    expect(texto).toContain("/FontFile2");
    expect(texto).toContain("/ToUnicode");
    expect(texto).toContain("/BaseFont /LiberationSans-Bold");
    expect(texto).toMatch(/BT \/E\d+ [\d.]+ Tf/u);
    expect(texto).not.toContain("Marta) Tj");
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
    // Las marcas de corte son líneas dibujadas fuera de la caja acabada.
    expect(contenido).toContain(" m ");
    expect(contenido).toContain(" l S");
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
    const extraido = extractPdfText(contenido);

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
