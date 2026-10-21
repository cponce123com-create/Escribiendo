/**
 * Prueba de esfuerzo de la exportación.
 *
 * Genera un manuscrito grande, con imágenes y con notas al pie, y exporta los
 * tres formatos midiendo el tiempo, el tamaño del archivo y la memoria máxima
 * del proceso. Sirve para dimensionar la instancia de Render Free, que tiene
 * 512 MB, y para detectar regresiones de rendimiento.
 *
 * Uso:
 *   pnpm stress:export
 *
 * Lo que no incluye: la descarga de imágenes de Cloudinary (no hay
 * credenciales en el repositorio) y la base de datos. Las imágenes se generan
 * aquí con `sharp`, igual que las normaliza la aplicación.
 */
import { randomFillSync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  buildDocx,
  buildEpub,
  buildPdf,
  measureTrueTypeTextPoints,
  parseTrueTypeFont,
  type ExportBlock,
  type ExportChapter,
  type ExportDocumentModel,
  type ExportImageAsset,
  type ExportImageMap,
  type PdfImage,
} from "../packages/export-engine/src/index";
import {
  paginate,
  withTypographyDefaults,
  type LayoutBlock,
  type MeasureText,
} from "../packages/editorial-engine/src/index";
import { zipEntriesResumen } from "../packages/export-engine/src/test-utils";

/** Palabras del manuscrito de prueba. */
const PALABRAS = 200_000;

/** Imágenes del manuscrito de prueba. */
const IMAGENES = 80;

/** Llamadas con nota al pie. */
const NOTAS = 500;

/** Imágenes por capítulo. */
const IMAGENES_POR_CAPITULO = 4;

const GEOMETRIA = {
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 14,
  marginOuterMm: 18,
  gutterMm: 0,
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

const MEDIR: MeasureText = (text, options) =>
  measureTrueTypeTextPoints(
    FUENTE,
    options.uppercase ? text.toLocaleUpperCase("es") : text,
    options.fontSizePt,
    options.letterSpacingPt ?? 0,
  );

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
  "…",
  "niño",
  "miró",
  "—",
];

/** Manuscrito con los tres formatos de bloque que más pesan. */
function manuscrito(): { capitulos: ExportChapter[]; bloques: LayoutBlock[] } {
  const bloques: LayoutBlock[] = [];
  const capitulos: ExportChapter[] = [];
  let capitulo = 0;
  let palabrasEscritas = 0;
  let notasEscritas = 0;
  let imagenesEscritas = 0;

  while (palabrasEscritas < PALABRAS) {
    capitulo += 1;
    const titulo = `Capítulo ${capitulo}`;
    const bloquesCapitulo: ExportBlock[] = [];

    bloquesCapitulo.push({ kind: "title", text: titulo });
    bloques.push({ id: `titulo-${capitulo}`, kind: "heading1", text: titulo });

    // Las imágenes se reparten entre los capítulos, como en un libro real.
    for (let imagen = 0; imagen < IMAGENES_POR_CAPITULO; imagen += 1) {
      if (imagenesEscritas >= IMAGENES) {
        break;
      }

      const src = `https://res.cloudinary.com/demo/image/upload/prueba-${imagenesEscritas}.jpg`;

      bloquesCapitulo.push({
        kind: "image",
        text: `Imagen ${imagenesEscritas + 1}`,
        image: {
          src,
          alt: `Imagen de prueba ${imagenesEscritas + 1}`,
          caption: "Pie de la imagen",
        },
      });
      bloques.push({
        id: `imagen-${imagenesEscritas}`,
        kind: "image",
        text: `Imagen ${imagenesEscritas + 1}`,
        image: { src, alt: `Imagen de prueba ${imagenesEscritas + 1}` },
      });
      imagenesEscritas += 1;
    }

    while (palabrasEscritas < PALABRAS && bloquesCapitulo.length < 40) {
      const parrafo: string[] = [];

      for (let indice = 0; indice < 220; indice += 1) {
        parrafo.push(VOCABULARIO[indice % VOCABULARIO.length] ?? "palabra");
      }

      palabrasEscritas += parrafo.length;

      if (notasEscritas < NOTAS && parrafo.length > 10) {
        const runs = [
          { text: `${parrafo.slice(0, 10).join(" ")} ` },
          {
            text: "1",
            superscript: true,
            footnote: {
              id: `nota-${notasEscritas + 1}`,
              number: notasEscritas + 1,
              note: `Nota de prueba número ${notasEscritas + 1}: explica el detalle en una línea.`,
            },
          },
          { text: ` ${parrafo.slice(10).join(" ")}.` },
        ];

        notasEscritas += 1;
        bloquesCapitulo.push({
          kind: "body",
          text: `${parrafo.join(" ")}.`,
          runs,
        });
        bloques.push({
          id: `parrafo-${bloques.length}`,
          kind: "body",
          text: `${parrafo.join(" ")}.`,
          runs,
        });
      } else {
        bloquesCapitulo.push({ kind: "body", text: `${parrafo.join(" ")}.` });
        bloques.push({
          id: `parrafo-${bloques.length}`,
          kind: "body",
          text: `${parrafo.join(" ")}.`,
        });
      }
    }

    capitulos.push({ id: `capitulo-${capitulo}`, title: titulo, blocks: bloquesCapitulo });
  }

  return { capitulos, bloques };
}

/** Imágenes de prueba, ya normalizadas como las que usa la aplicación. */
async function imagenes(): Promise<ExportImageMap> {
  const mapa = new Map<string, ExportImageAsset>();
  const ancho = 1200;
  const alto = 800;
  const ruido = Buffer.allocUnsafe(ancho * alto * 3);

  for (let indice = 0; indice < IMAGENES; indice += 1) {
    const src = `https://res.cloudinary.com/demo/image/upload/prueba-${indice}.jpg`;
    // Ruido pseudoaleatorio: se parece a una fotografía y no se comprime, que
    // es el caso peor para el tamaño del archivo.
    randomFillSync(ruido);
    const data = await sharp(ruido, { raw: { width: ancho, height: alto, channels: 3 } })
      .jpeg({ quality: 70 })
      .toBuffer();

    mapa.set(src, {
      data: new Uint8Array(data),
      mimeType: "image/jpeg",
      extension: "jpg",
      width: ancho,
      height: alto,
    });
  }

  return mapa;
}

function cronometrar<T>(operacion: () => T): { resultado: T; ms: number } {
  const inicio = performance.now();
  const resultado = operacion();

  return { resultado, ms: performance.now() - inicio };
}

async function main(): Promise<void> {
  process.stdout.write("Manuscrito de esfuerzo\n");
  process.stdout.write(`  palabras: ${PALABRAS}\n`);
  process.stdout.write(`  imágenes: ${IMAGENES}\n`);
  process.stdout.write(`  notas al pie: ${NOTAS}\n\n`);

  const inicio = performance.now();
  const { capitulos, bloques } = manuscrito();
  const assets = await imagenes();

  process.stdout.write(
    `  manuscrito e imágenes listos en ${((performance.now() - inicio) / 1000).toFixed(1)} s, ` +
      `memoria ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB, ` +
      `máxima ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB\n\n`,
  );

  const paginacion = cronometrar(() => paginate(bloques, GEOMETRIA, TIPOGRAFIA, MEDIR));
  const paginas = paginacion.resultado.pages;

  process.stdout.write(
    `  paginación: ${paginacion.ms.toFixed(0)} ms, ${paginas.length} páginas, ` +
      `${paginacion.resultado.diagnostics.length} diagnósticos, ` +
      `memoria ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB, ` +
      `máxima ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB\n`,
  );

  // Las imágenes se reparten por las páginas, como hace la aplicación.
  const imagenesPorPagina = new Map<number, PdfImage[]>();
  let indiceImagen = 0;

  paginas.forEach((pagina, numero) => {
    const imagenesDePagina: PdfImage[] = [];

    if (indiceImagen < IMAGENES) {
      const src = `https://res.cloudinary.com/demo/image/upload/prueba-${indiceImagen}.jpg`;
      const asset = assets.get(src);

      imagenesDePagina.push({
        topMm: 20,
        xMm: 18,
        widthMm: 100,
        heightMm: 66.67,
        src,
        alt: `Imagen de prueba ${indiceImagen + 1}`,
        ...(asset
          ? {
              data: asset.data,
              pixelWidth: asset.width,
              pixelHeight: asset.height,
            }
          : {}),
      });
      indiceImagen += 1;
    }

    if (imagenesDePagina.length > 0) {
      imagenesPorPagina.set(numero, imagenesDePagina);
    }
  });

  const pdf = cronometrar(() =>
    buildPdf({
      title: "Manuscrito de esfuerzo",
      author: "Prueba",
      createdAt: new Date("2026-10-20T10:00:00.000Z"),
      fonts: [
        {
          family: "serif",
          style: "regular",
          data: FUENTE.data,
          name: "LiberationSerif-Regular",
        },
      ],
      pages: paginas.map((pagina, numero) => ({
        widthMm: GEOMETRIA.pageWidthMm,
        heightMm: GEOMETRIA.pageHeightMm,
        images: imagenesPorPagina.get(numero) ?? [],
        runs: pagina.blocks.flatMap((bloque) =>
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

  const modelo: ExportDocumentModel = {
    title: "Manuscrito de esfuerzo",
    author: "Prueba",
    language: "es",
    identifier: "urn:uuid:00000000-0000-4000-8000-000000000000",
    chapters: capitulos,
  };

  const epub = cronometrar(() => buildEpub(modelo, new Date("2026-10-20T10:00:00.000Z"), assets));

  const docx = cronometrar(() => buildDocx(modelo, new Date("2026-10-20T10:00:00.000Z"), assets));

  const maxRss = process.resourceUsage().maxRSS / 1024;
  const entradasEpub = zipEntriesResumen(epub.resultado);
  const imagenesEpub = entradasEpub.filter((entrada) =>
    entrada.name.startsWith("EPUB/images/"),
  ).length;
  const entradasDocx = zipEntriesResumen(docx.resultado);
  const imagenesDocx = entradasDocx.filter((entrada) =>
    entrada.name.startsWith("word/media/"),
  ).length;

  process.stdout.write("\nResultados\n");
  process.stdout.write(
    `  PDF:  ${pdf.ms.toFixed(0)} ms, ${(pdf.resultado.bytes.length / 1024).toFixed(0)} KB, ` +
      `${pdf.resultado.imagenesIncrustadas} imágenes incrustadas\n`,
  );
  process.stdout.write(
    `  EPUB: ${epub.ms.toFixed(0)} ms, ${(epub.resultado.length / 1024).toFixed(0)} KB, ` +
      `${imagenesEpub} imágenes incrustadas\n`,
  );
  process.stdout.write(
    `  DOCX: ${docx.ms.toFixed(0)} ms, ${(docx.resultado.length / 1024).toFixed(0)} KB, ` +
      `${imagenesDocx} imágenes incrustadas\n`,
  );
  process.stdout.write(`  memoria máxima del proceso: ${maxRss.toFixed(0)} MB\n`);
  process.stdout.write(
    `\n  La instancia de Render Free tiene 512 MB: el margen es de ` +
      `${(512 - maxRss).toFixed(0)} MB.\n`,
  );
}

await main();
