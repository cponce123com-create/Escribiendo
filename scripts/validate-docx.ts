/**
 * Validación del DOCX con un lector externo.
 *
 * Genera un DOCX de prueba con el mismo motor que usa la aplicación y lo abre
 * con LibreOffice por defecto, comprobando también el PDF resultante con pdf.js.
 * Se conserva DOCX_VALIDATOR para lectores alternativos que emitan texto/HTML:
 * por ejemplo Mammoth:
 *
 *   DOCX_VALIDATOR="pnpm dlx mammoth@1.11.0" pnpm validate:docx
 *
 * Códigos de salida:
 *
 *   0  el lector externo abre el documento y encuentra el texto esperado.
 *   1  el lector externo falla o no encuentra el texto.
 *   2  falta el lector externo o una dependencia: no se ha validado nada.
 *
 * El script no modifica el repositorio: el DOCX se escribe en una carpeta
 * temporal y se indica su ruta en la salida.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildDocx } from "../packages/export-engine/src/index";
import { documentoDePrueba, FECHA, imagenesDePrueba, textosFaltantes } from "./lib/export-fixtures";

function main(): void {
  if (!process.env.DOCX_VALIDATOR) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/validate-docx-libreoffice.ts"],
      {
        stdio: "inherit",
        timeout: 240_000,
      },
    );
    if (result.error)
      process.stderr.write(`No se pudo ejecutar LibreOffice: ${result.error.message}\n`);
    process.exit(result.status ?? 2);
  }
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
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
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

  const faltan = textosFaltantes(limpio);
  if (faltan.length > 0) {
    process.stdout.write(`El lector no ha encontrado el texto esperado: ${faltan.join(" | ")}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `El lector externo ha encontrado el texto esperado: todos los textos del documento.\n`,
  );
  process.exit(0);
}

main();
