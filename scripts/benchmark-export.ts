/**
 * Medición del coste de componer y exportar un manuscrito.
 *
 * Genera manuscritos de 10 000, 50 000, 100 000 y 200 000 palabras y mide
 * cuánto tardan la paginación y la escritura de cada formato, y cuánta
 * memoria se usa.
 *
 * Las cifras sirven para dimensionar el plan de Render Free: la exportación
 * ocurre dentro de la petición web, de modo que un manuscrito muy grande
 * puede agotar la memoria de la instancia.
 *
 * Uso:
 *   pnpm bench:export
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  paginate,
  withTypographyDefaults,
  type MeasureText,
} from "../packages/editorial-engine/src/index";
import {
  buildDocx,
  buildEpub,
  buildPdf,
  measureTrueTypeTextPoints,
  parseTrueTypeFont,
  type PdfFontProgram,
} from "../packages/export-engine/src/index";

loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

/** Palabras que se usan para el texto de prueba. */
const VOCABULARIO = [
  "el",
  "velo",
  "de",
  "la",
  "tarde",
  "caía",
  "sobre",
  "plaza",
  "mientras",
  "reloj",
  "iglesia",
  "marcaba",
  "las",
  "siete",
  "media",
  "«Cita»",
  "—",
  "niño",
  "miró",
  "…",
];

const GEOMETRIA = {
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 14,
  gutterMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 10,
  chapterStartsRecto: true,
};

const TIPOGRAFIA = withTypographyDefaults({});

const FUENTE = parseTrueTypeFont(
  new Uint8Array(
    readFileSync(
      path.resolve(process.cwd(), "apps/web/public/fonts/liberation/LiberationSerif-Regular.ttf"),
    ),
  ),
  "LiberationSerif-Regular",
);
const FUENTE_PDF: PdfFontProgram = {
  family: "serif",
  style: "regular",
  data: FUENTE.data,
  name: "LiberationSerif-Regular",
};
const MEDIR: MeasureText = (text, options) =>
  measureTrueTypeTextPoints(
    FUENTE,
    options.uppercase ? text.toLocaleUpperCase("es") : text,
    options.fontSizePt,
    options.letterSpacingPt ?? 0,
  );

interface Bloque {
  id: string;
  kind: "body" | "heading1";
  text: string;
  sectionId?: string;
  sectionTitle?: string;
  startsChapter?: boolean;
  firstOfSection?: boolean;
}

/** Manuscrito de `palabras` palabras repartido en párrafos y capítulos. */
function manuscrito(palabras: number): Bloque[] {
  const bloques: Bloque[] = [];
  const porParrafo = 220;
  let escritas = 0;
  let indice = 0;

  while (escritas < palabras) {
    const esCapitulo = indice % 20 === 0;
    const largo = Math.min(porParrafo, palabras - escritas);
    const texto: string[] = [];

    for (let indicePalabra = 0; indicePalabra < largo; indicePalabra += 1) {
      texto.push(VOCABULARIO[(escritas + indicePalabra) % VOCABULARIO.length] ?? "el");
    }

    if (esCapitulo) {
      bloques.push({
        id: `titulo-${indice}`,
        kind: "heading1",
        text: `Capítulo ${indice / 20 + 1}`,
        sectionId: `seccion-${indice}`,
        sectionTitle: `Capítulo ${indice / 20 + 1}`,
        startsChapter: true,
        firstOfSection: true,
      });
    }

    bloques.push({
      id: `parrafo-${indice}`,
      kind: "body",
      text: texto.join(" "),
      sectionId: `seccion-${indice}`,
      sectionTitle: `Capítulo ${indice / 20 + 1}`,
      firstOfSection: esCapitulo,
    });

    escritas += largo;
    indice += 1;
  }

  return bloques;
}

/** Memoria que usa el proceso, en megabytes. */
function memoriaMb(): number {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function cronometrar<T>(operacion: () => T): { resultado: T; ms: number } {
  const inicio = performance.now();
  const resultado = operacion();

  return { resultado, ms: performance.now() - inicio };
}

const TAMANOS = [10_000, 50_000, 100_000, 200_000];

console.log("Coste de composición y exportación");
console.log(
  "  Formato  Palabras   Páginas   Paginación   PDF      PDF KB   EPUB     EPUB KB   DOCX     DOCX KB   Memoria",
);
console.log(
  "  -------  --------  --------  ----------  -------  -------  -------  --------  -------  --------  -------",
);

for (const palabras of TAMANOS) {
  const antes = memoriaMb();
  const bloques = manuscrito(palabras);

  const paginacion = cronometrar(() => paginate(bloques, GEOMETRIA, TIPOGRAFIA, MEDIR));
  const paginas = paginacion.resultado.pages;

  const pdf = cronometrar(() =>
    buildPdf({
      title: "Manuscrito de prueba",
      author: "Prueba",
      createdAt: new Date("2026-10-20T10:00:00.000Z"),
      fonts: [FUENTE_PDF],
      pages: paginas.map((page) => ({
        widthMm: GEOMETRIA.pageWidthMm,
        heightMm: GEOMETRIA.pageHeightMm,
        runs: page.blocks.flatMap((bloque) =>
          bloque.lines.map((linea, indice) => ({
            text: linea.text,
            font: "regular" as const,
            family: "serif" as const,
            sizePt: 11,
            xMm: 18,
            baselineMm: 20 + indice * 5,
          })),
        ),
      })),
    }),
  );

  const capitulos: Array<{
    id: string;
    title: string;
    blocks: Array<{ kind: "title" | "body"; text: string }>;
  }> = [];
  let indiceCapitulo = 0;

  for (const bloque of bloques) {
    if (bloque.kind === "heading1") {
      indiceCapitulo += 1;
      capitulos.push({ id: `c${indiceCapitulo}`, title: bloque.text, blocks: [] });
    }

    capitulos[capitulos.length - 1]?.blocks.push({
      kind: bloque.kind === "heading1" ? "title" : "body",
      text: bloque.text,
    });
  }

  const modelo = {
    title: "Manuscrito de prueba",
    author: "Prueba",
    language: "es",
    identifier: "urn:uuid:00000000-0000-4000-8000-000000000000",
    chapters: capitulos,
  };

  const epub = cronometrar(() => buildEpub(modelo, new Date("2026-10-20T10:00:00.000Z")));
  const docx = cronometrar(() => buildDocx(modelo, new Date("2026-10-20T10:00:00.000Z")));
  const despues = memoriaMb();

  console.log(
    `  PDF      ${String(palabras).padStart(8)}  ${String(paginas.length).padStart(8)}  ` +
      `${`${paginacion.ms.toFixed(0)} ms`.padStart(10)}  ${`${pdf.ms.toFixed(0)} ms`.padStart(7)}  ` +
      `${`${(pdf.resultado.bytes.length / 1024).toFixed(0)} KB`.padStart(7)}  ` +
      `${`${epub.ms.toFixed(0)} ms`.padStart(7)}  ` +
      `${`${(epub.resultado.length / 1024).toFixed(0)} KB`.padStart(8)}  ` +
      `${`${docx.ms.toFixed(0)} ms`.padStart(7)}  ` +
      `${`${(docx.resultado.length / 1024).toFixed(0)} KB`.padStart(8)}  ` +
      `${`${(despues - antes).toFixed(1)} MB`.padStart(7)}`,
  );
}

console.log(
  "\nLa memoria es la diferencia entre el mínimo y el máximo de la reserva del proceso, no el consumo absoluto.",
);
