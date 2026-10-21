/**
 * Validación del DOCX con un lector externo.
 *
 * Genera un DOCX de prueba con el mismo motor que usa la aplicación y lo abre
 * con la herramienta que se indique, para comprobar que un lector independiente
 * entiende el paquete. Por ejemplo, con Mammoth, que convierte el documento a
 * HTML:
 *
 *   DOCX_VALIDATOR="pnpm dlx mammoth@1.11.0" pnpm validate:docx
 *
 * Códigos de salida:
 *
 *   0  el lector externo abre el documento y encuentra el texto esperado.
 *   1  el lector externo falla o no encuentra el texto.
 *   2  no hay lector externo configurado: no se ha validado nada.
 *
 * El script no modifica el repositorio: el DOCX se escribe en una carpeta
 * temporal y se indica su ruta en la salida.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildDocx } from "../packages/export-engine/src/index";
import { documentoDePrueba, FECHA, imagenesDePrueba } from "./lib/export-fixtures";

/** Texto que el lector externo tiene que encontrar en el documento. */
const ESPERADO = "El velo de la tarde caía sobre la plaza.";

function main(): void {
  const destino = mkdtempSync(path.join(tmpdir(), "escribiendo-docx-"));
  const archivo = path.join(destino, "libro.docx");
  const docx = buildDocx(documentoDePrueba(), FECHA, imagenesDePrueba());

  writeFileSync(archivo, docx);

  process.stdout.write(`DOCX generado: ${archivo} (${docx.length} bytes)\n`);

  const comando = process.env.DOCX_VALIDATOR;

  if (!comando) {
    process.stdout.write(
      "No hay lector externo configurado: define DOCX_VALIDATOR para validar. No se ha validado nada.\n",
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

  // El lector puede partir el texto en varias etiquetas: se comparan sin
  // espacios para que el formato no tape una lectura correcta.
  const limpio = salida
    .replace(/<[^>]*>/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  if (!limpio.includes(ESPERADO)) {
    process.stdout.write(`El lector no ha encontrado el texto esperado: ${ESPERADO}\n`);
    process.exit(1);
  }

  process.stdout.write(`El lector externo ha encontrado el texto esperado: ${ESPERADO}\n`);
  process.exit(0);
}

main();
