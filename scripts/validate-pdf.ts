/**
 * Validación del PDF con un lector externo.
 *
 * Genera un PDF de prueba con el mismo motor que usa la aplicación y lo abre
 * con la herramienta que se indique, para comprobar que un lector
 * independiente lo entiende. El validador de referencia es `pdf.js`, el
 * lector de PDF de Mozilla, que vive en `scripts/pdfjs`:
 *
 *   pnpm --dir scripts/pdfjs install
 *   PDF_VALIDATOR="node scripts/pdfjs/valida-pdf.mjs" pnpm validate:pdf
 *
 * Códigos de salida:
 *
 *   0  el lector externo abre el documento y encuentra el texto esperado.
 *   1  el lector externo falla o no encuentra el texto.
 *   2  no hay lector externo configurado: no se ha validado nada.
 *
 * El script no modifica el repositorio: el PDF se escribe en una carpeta
 * temporal y se indica su ruta en la salida.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildPdf, parseTrueTypeFont } from "../packages/export-engine/src/index";
import { documentoDePrueba, FECHA } from "./lib/export-fixtures";

/** Texto que el lector externo tiene que encontrar en el documento. */
const ESPERADO = "El velo de la tarde caía sobre la plaza.";

/**
 * Genera el PDF de prueba.
 *
 * Usa la misma fuente que incrusta la aplicación, leída del repositorio, para
 * que la validación compruebe también la fuente y no solo el texto plano.
 */
function generarPdf(destino: string): number {
  const fuente = new Uint8Array(
    readFileSync(
      path.resolve(process.cwd(), "apps/web/public/fonts/liberation/LiberationSerif-Regular.ttf"),
    ),
  );
  const programa = parseTrueTypeFont(fuente, "LiberationSerif-Regular");
  const modelo = documentoDePrueba();
  const capitulo = modelo.chapters[0];
  const bloques = capitulo?.blocks ?? [];

  const pdf = buildPdf({
    title: modelo.title,
    author: modelo.author,
    createdAt: FECHA,
    language: modelo.language,
    fonts: [
      {
        family: "serif",
        style: "regular",
        data: programa.data,
        name: "LiberationSerif-Regular",
      },
    ],
    pages: [
      {
        widthMm: 148,
        heightMm: 210,
        runs: bloques
          .filter((bloque) => bloque.kind !== "image" && bloque.kind !== "rule")
          .map((bloque, indice) => ({
            text: bloque.text,
            font: "regular" as const,
            family: "serif" as const,
            sizePt: 11,
            xMm: 18,
            baselineMm: 30 + indice * 6,
          })),
      },
    ],
  });

  writeFileSync(destino, pdf.bytes);

  return pdf.bytes.length;
}

function main(): void {
  const destino = mkdtempSync(path.join(tmpdir(), "escribiendo-pdf-"));
  const archivo = path.join(destino, "libro.pdf");
  const bytes = generarPdf(archivo);

  process.stdout.write(`PDF generado: ${archivo} (${bytes} bytes)\n`);

  const comando = process.env.PDF_VALIDATOR;

  if (!comando) {
    process.stdout.write(
      "No hay lector externo configurado: define PDF_VALIDATOR para validar. No se ha validado nada.\n",
    );
    process.exit(2);
  }

  const resultado = spawnSync(`${comando} "${archivo}"`, {
    encoding: "utf8",
    shell: true,
  });
  const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;

  process.stdout.write(salida);

  if (resultado.error) {
    process.stdout.write(`No se ha podido ejecutar el lector: ${resultado.error.message}\n`);
    process.exit(2);
  }

  if (resultado.status !== 0) {
    process.exit(1);
  }

  // El lector puede partir el texto en varias frases: se comparan sin
  // espacios para que el formato no tape una lectura correcta.
  const limpio = salida.replace(/\s+/gu, " ").trim();

  if (!limpio.includes(ESPERADO)) {
    process.stdout.write(`El lector no ha encontrado el texto esperado: ${ESPERADO}\n`);
    process.exit(1);
  }

  process.stdout.write(`El lector externo ha encontrado el texto esperado: ${ESPERADO}\n`);
  process.exit(0);
}

main();
