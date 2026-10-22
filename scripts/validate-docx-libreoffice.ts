/**
 * Validación del DOCX con LibreOffice.
 *
 * Genera el DOCX de prueba con el mismo motor que usa la aplicación, lo abre
 * con LibreOffice en modo sin interfaz y comprueba que el PDF resultante
 * conserva el texto, la nota al pie y el pie de la imagen. Es la validación con
 * un procesador de textos real, complementaria a Mammoth y a pdf.js.
 *
 * Uso:
 *
 *   pnpm validate:docx:libreoffice
 *
 * Si LibreOffice no está en el PATH, indica el ejecutable o su carpeta:
 *
 *   LIBREOFFICE="C:\Program Files\LibreOffice\program\soffice.exe" \
 *     pnpm validate:docx:libreoffice
 *
 * Requiere el validador de pdf.js:
 *
 *   pnpm --dir scripts/pdfjs install
 *
 * El DOCX y el PDF se escriben en una carpeta temporal y se indican sus rutas.
 * Para conservarlos en una ruta conocida (por ejemplo, como artefacto de CI),
 * define DOCX_VALIDATION_DIR.
 *
 * Códigos de salida:
 *
 *   0  LibreOffice abre el DOCX y el PDF conserva el contenido esperado.
 *   1  LibreOffice falla o el contenido no coincide.
 *   2  falta LibreOffice o el validador de pdf.js.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildDocx } from "../packages/export-engine/src/index";
import { documentoDePrueba, FECHA, imagenesDePrueba } from "./lib/export-fixtures";

/** Textos que tienen que sobrevivir al viaje DOCX -> LibreOffice -> PDF. */
const TEXTOS_ESPERADOS = [
  "El velo de la tarde caía sobre la plaza.",
  "La nota explica el detalle.",
  "Pie de la imagen de prueba",
  "Segunda parte del capítulo.",
];

function nombresDelEjecutable(): string[] {
  return process.platform === "win32" ? ["soffice.exe", "soffice.com"] : ["soffice"];
}

/** Rutas que se prueban, en orden, para encontrar LibreOffice. */
function candidatosLibreOffice(): string[] {
  const nombres = nombresDelEjecutable();
  const candidatos: string[] = [];
  const configurado = process.env.LIBREOFFICE?.trim();

  if (configurado) {
    candidatos.push(configurado);

    for (const nombre of nombres) {
      candidatos.push(path.join(configurado, nombre));
      candidatos.push(path.join(configurado, "program", nombre));
    }
  }

  candidatos.push(...nombres);

  if (process.platform === "win32") {
    candidatos.push(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    );
  } else if (process.platform === "darwin") {
    candidatos.push("/Applications/LibreOffice.app/Contents/MacOS/soffice");
  } else {
    candidatos.push("/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice");
  }

  return [...new Set(candidatos)];
}

/**
 * En Windows, `soffice.com` es el lanzador de consola: escribe la versión y
 * espera a que termine la conversión. `soffice.exe` es la aplicación gráfica y
 * puede dejar un `soffice.bin` en segundo plano. Se prefiere el primero.
 */
function preferirConsola(ruta: string): string {
  if (process.platform === "win32" && ruta.toLowerCase().endsWith(".exe")) {
    const consola = `${ruta.slice(0, -4)}.com`;

    if (existsSync(consola)) {
      return consola;
    }
  }

  return ruta;
}

function encontrarLibreOffice(): string | null {
  for (const candidato of candidatosLibreOffice()) {
    const resultado = spawnSync(candidato, ["--version"], {
      encoding: "utf8",
      timeout: 30_000,
    });

    if (resultado.status === 0) {
      return preferirConsola(candidato);
    }
  }

  return null;
}

/**
 * Lee la versión del ejecutable elegido.
 *
 * En Windows, `soffice.exe` es una aplicación de interfaz gráfica y no escribe
 * en la consola; su hermano `soffice.com` sí. Se prueba el segundo solo para
 * obtener la versión y se mantiene el primero para la conversión.
 */
function leerVersion(libreOffice: string): string {
  const intentos = [libreOffice];

  if (process.platform === "win32" && libreOffice.toLowerCase().endsWith(".exe")) {
    const consola = `${libreOffice.slice(0, -4)}.com`;

    if (existsSync(consola)) {
      intentos.push(consola);
    }
  }

  for (const ejecutable of intentos) {
    const resultado = spawnSync(ejecutable, ["--version"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    const texto = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`.trim();

    if (texto) {
      return texto.split(/\r?\n/u)[0] ?? texto;
    }
  }

  return "(versión no disponible)";
}

/** URL `file://` que LibreOffice acepta para el perfil de usuario. */
function urlDeArchivo(ruta: string): string {
  const normalizada = ruta.replace(/\\/gu, "/");

  return normalizada.startsWith("/") ? `file://${normalizada}` : `file:///${normalizada}`;
}

function main(): void {
  const libreOffice = encontrarLibreOffice();

  if (!libreOffice) {
    process.stdout.write(
      "No se ha encontrado LibreOffice. Instálalo o define LIBREOFFICE con la ruta del ejecutable.\n" +
        "No se ha validado nada.\n",
    );
    process.exit(2);
  }

  const versionTexto = leerVersion(libreOffice);

  const destino = process.env.DOCX_VALIDATION_DIR
    ? path.resolve(process.env.DOCX_VALIDATION_DIR)
    : mkdtempSync(path.join(tmpdir(), "escribiendo-docx-lo-"));
  mkdirSync(destino, { recursive: true });

  const archivo = path.join(destino, "libro.docx");
  const docx = buildDocx(documentoDePrueba(), FECHA, imagenesDePrueba());

  writeFileSync(archivo, docx);

  process.stdout.write(`DOCX generado: ${archivo} (${docx.length} bytes)\n`);
  process.stdout.write(`Lector: ${versionTexto} (${libreOffice})\n`);

  const perfil = mkdtempSync(path.join(tmpdir(), "escribiendo-lo-profile-"));
  const resultado = spawnSync(
    libreOffice,
    [
      "--headless",
      "--norestore",
      `-env:UserInstallation=${urlDeArchivo(perfil)}`,
      "--convert-to",
      "pdf",
      "--outdir",
      destino,
      archivo,
    ],
    { encoding: "utf8", timeout: 180_000 },
  );
  const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;

  process.stdout.write(salida);

  if (resultado.error) {
    process.stdout.write(`No se ha podido ejecutar LibreOffice: ${resultado.error.message}\n`);
    process.exit(1);
  }

  if (resultado.status !== 0) {
    process.stdout.write(`LibreOffice ha fallado con código ${resultado.status}.\n`);
    process.exit(1);
  }

  const pdf = path.join(destino, "libro.pdf");

  if (!existsSync(pdf)) {
    process.stdout.write(`LibreOffice no ha creado el PDF esperado: ${pdf}\n`);
    process.exit(1);
  }

  const validador = path.resolve(process.cwd(), "scripts/pdfjs/valida-pdf.mjs");

  if (!existsSync(validador)) {
    process.stdout.write(
      "No se ha encontrado el validador de pdf.js. Ejecuta `pnpm --dir scripts/pdfjs install`.\n" +
        "No se ha validado nada.\n",
    );
    process.exit(2);
  }

  const lectura = spawnSync(process.execPath, [validador, pdf, "--full"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  const texto = `${lectura.stdout ?? ""}${lectura.stderr ?? ""}`;

  process.stdout.write(texto);

  if (lectura.error || lectura.status !== 0) {
    process.stdout.write("pdf.js no ha podido leer el PDF generado por LibreOffice.\n");
    process.exit(1);
  }

  const paginas = Number(/paginas: (\d+)/u.exec(texto)?.[1] ?? "0");

  if (paginas <= 0) {
    process.stdout.write("El PDF no tiene páginas legibles.\n");
    process.exit(1);
  }

  const plano = texto.replace(/\s+/gu, " ");
  const faltan = TEXTOS_ESPERADOS.filter((esperado) => !plano.includes(esperado));

  if (faltan.length > 0) {
    process.stdout.write(`No se han encontrado estos textos en el PDF: ${faltan.join(" | ")}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `LibreOffice ha abierto el DOCX: ${paginas} páginas y ${TEXTOS_ESPERADOS.length} textos conservados.\n`,
  );
  process.exit(0);
}

main();
