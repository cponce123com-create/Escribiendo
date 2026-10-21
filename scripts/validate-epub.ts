/**
 * Validación del EPUB con EPUBCheck.
 *
 * Genera un EPUB de prueba con el mismo motor que usa la aplicación y lo
 * valida con EPUBCheck, la herramienta oficial del W3C. EPUBCheck necesita
 * Java, así que el script solo lo ejecuta si se le indica dónde está el
 * `epubcheck.jar`:
 *
 *   EPUBCHECK_JAR=ruta\epubcheck.jar pnpm validate:epub
 *
 * Códigos de salida:
 *
 *   0  el EPUB no tiene errores (puede tener avisos).
 *   1  EPUBCheck ha encontrado errores.
 *   2  EPUBCheck no está disponible: no se ha validado nada.
 *
 * El script no modifica el repositorio: el EPUB se escribe en una carpeta
 * temporal y se indica su ruta en la salida.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildEpub } from "../packages/export-engine/src/index";
import { documentoDePrueba, FECHA, imagenesDePrueba } from "./lib/export-fixtures";

function main(): void {
  const destino = mkdtempSync(path.join(tmpdir(), "escribiendo-epub-"));
  const archivo = path.join(destino, "libro.epub");
  const epub = buildEpub(documentoDePrueba(), FECHA, imagenesDePrueba());

  writeFileSync(archivo, epub);

  process.stdout.write(`EPUB generado: ${archivo} (${epub.length} bytes)\n`);

  const jar = process.env.EPUBCHECK_JAR;

  if (!jar) {
    process.stdout.write(
      "EPUBCheck no está configurado: define EPUBCHECK_JAR para validar. No se ha validado nada.\n",
    );
    process.exit(2);
  }

  const java = process.env.JAVA ?? "java";
  const resultado = spawnSync(java, ["-jar", jar, archivo], { encoding: "utf8" });
  const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;

  process.stdout.write(salida);

  if (resultado.error) {
    process.stdout.write(`No se ha podido ejecutar EPUBCheck: ${resultado.error.message}\n`);
    process.exit(2);
  }

  // EPUBCheck devuelve 0 sin errores, 1 con errores y 2 con avisos graves.
  process.exit(resultado.status === 0 ? 0 : 1);
}

main();
