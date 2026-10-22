/**
 * Validador externo del PDF, con el lector de PDF de Mozilla (pdf.js).
 *
 * Es una herramienta independiente del motor de escritura: si pdf.js abre el
 * archivo y devuelve su texto, el PDF está bien formado, la fuente incrustada
 * se puede leer y el mapa `ToUnicode` funciona.
 *
 * Uso:
 *   node scripts/pdfjs/valida-pdf.mjs archivo.pdf [--full]
 *
 * Con `--full` se imprime todo el texto; sin él se limita a 600 caracteres,
 * que es suficiente para comprobar una frase concreta.
 *
 * Requiere instalar la dependencia del lector:
 *   pnpm --dir scripts/pdfjs install
 */
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const archivo = process.argv[2];
const completo = process.argv.includes("--full");

if (!archivo) {
  console.error("Uso: node scripts/pdfjs/valida-pdf.mjs <archivo.pdf>");
  process.exit(2);
}

const datos = new Uint8Array(await readFile(archivo));
const documento = await getDocument({ data: datos, useSystemFonts: false }).promise;
const paginas = [];

for (let numero = 1; numero <= documento.numPages; numero += 1) {
  const pagina = await documento.getPage(numero);
  const contenido = await pagina.getTextContent();
  const texto = contenido.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();

  paginas.push(texto);
}

const texto = paginas.join(" ");

process.stdout.write(`paginas: ${documento.numPages}\n`);
process.stdout.write(`texto: ${completo ? texto : texto.slice(0, 600)}\n`);
