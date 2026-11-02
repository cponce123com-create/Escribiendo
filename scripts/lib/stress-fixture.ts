import type { LayoutBlock } from "../../packages/editorial-engine/src/index";
import type {
  ExportBlock,
  ExportChapter,
  ExportImageMap,
  ExportImageAsset,
} from "../../packages/export-engine/src/index";

export interface StressCase {
  id: string;
  words: number;
  chapters: number;
  images: number;
  footnotes: number;
}

export const MIXED_CASES: StressCase[] = [
  { id: "10-capitulos", words: 10_000, chapters: 10, images: 0, footnotes: 0 },
  { id: "50-capitulos", words: 50_000, chapters: 50, images: 8, footnotes: 50 },
  { id: "100-capitulos", words: 200_000, chapters: 100, images: 20, footnotes: 200 },
  { id: "200k-80-imagenes", words: 200_000, chapters: 100, images: 80, footnotes: 500 },
];
export const TEXT_CASES: StressCase[] = [10_000, 50_000, 100_000, 200_000].map((words) => ({
  id: `texto-${words}`,
  words,
  chapters: Math.min(100, words / 1000),
  images: 0,
  footnotes: 0,
}));

const WORDS = [
  "Sebastián",
  "recordó",
  "el",
  "río",
  "mientras",
  "Mariana",
  "volvía",
  "a",
  "San",
  "Ramón",
  "bajo",
  "la",
  "lluvia",
  "entre",
  "árboles",
  "y",
  "caminos",
  "del",
  "valle",
  "verde",
];

export function stressManuscript(config: StressCase): {
  chapters: ExportChapter[];
  blocks: LayoutBlock[];
} {
  const limits = { words: 200_000, chapters: 100, images: 80, footnotes: 1000 };
  for (const key of ["words", "chapters", "images", "footnotes"] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0 || config[key] > limits[key]) {
      throw new Error(`Parámetro de esfuerzo inválido: ${key}`);
    }
  }
  if (
    !config.chapters ||
    config.words < config.chapters ||
    config.footnotes > Math.ceil(config.words / 220)
  ) {
    throw new Error("El manuscrito no admite esa distribución de capítulos y notas.");
  }
  const chapters: ExportChapter[] = [];
  const blocks: LayoutBlock[] = [];
  let written = 0,
    notes = 0,
    images = 0;
  for (let index = 0; index < config.chapters; index += 1) {
    const id = `capitulo-${index + 1}`,
      title = `Capítulo ${index + 1}`;
    const chapter: ExportChapter = { id, title, blocks: [{ kind: "title", text: title }] };
    blocks.push({
      id: `${id}-titulo`,
      kind: "chapterTitle",
      text: title,
      sectionId: id,
      sectionTitle: title,
      startsChapter: true,
      firstOfSection: true,
    });
    const imageTarget = Math.floor(((index + 1) * config.images) / config.chapters);
    while (images < imageTarget) {
      const image = {
        src: `https://example.invalid/esfuerzo-${images}.jpg`,
        alt: `Imagen ${images + 1}`,
        caption: `Pie de la imagen ${images + 1}`,
        widthPx: 1200,
        heightPx: 800,
      };
      chapter.blocks.push({ kind: "image", text: image.alt, image });
      blocks.push({
        id: `${id}-imagen-${images}`,
        kind: "image",
        text: image.alt,
        image,
        sectionId: id,
        sectionTitle: title,
      });
      images += 1;
    }
    let remaining =
      Math.floor(config.words / config.chapters) + (index < config.words % config.chapters ? 1 : 0);
    while (remaining > 0) {
      const length = Math.min(220, remaining);
      const words = Array.from({ length }, (_, word) => WORDS[(written + word) % WORDS.length]!);
      const text = `${words.join(" ")}.`;
      const prefixLength = Math.min(10, words.length);
      const runs: NonNullable<ExportBlock["runs"]> = [
        {
          text: words.slice(0, prefixLength).join(" "),
          bold: written % 440 === 0,
          italic: written % 440 !== 0,
        },
      ];
      if (notes < config.footnotes) {
        notes += 1;
        runs.push({
          text: String(notes),
          superscript: true,
          footnote: {
            id: `nota-${notes}`,
            number: notes,
            note: `Nota ${notes}: un detalle del manuscrito de prueba.`,
          },
        });
      }
      runs.push({
        text: `${words.length > prefixLength ? ` ${words.slice(prefixLength).join(" ")}` : ""}.`,
      });
      chapter.blocks.push({ kind: "body", text, runs });
      blocks.push({
        id: `parrafo-${written}`,
        kind: "body",
        text,
        runs: runs.map((run) => ({
          text: run.text,
          marks: { bold: run.bold, italic: run.italic, superscript: run.superscript },
          ...(run.footnote ? { footnote: run.footnote } : {}),
        })),
        sectionId: id,
        sectionTitle: title,
      });
      remaining -= length;
      written += length;
    }
    chapters.push(chapter);
  }
  if (notes !== config.footnotes) throw new Error("No se generaron todas las notas solicitadas.");
  return { chapters, blocks };
}

/** PRNG fijo: las imágenes sintéticas se reproducen con la misma versión de sharp. */
export function fillStressNoise(bytes: Uint8Array, seed: number): number {
  let value = seed >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    bytes[index] = value >>> 24;
  }
  return value;
}

export async function stressImages(count: number): Promise<ExportImageMap> {
  if (!Number.isSafeInteger(count) || count < 0 || count > 80)
    throw new Error("Cantidad de imágenes inválida.");
  if (count === 0) return new Map();
  const { default: sharp } = await import("sharp");
  const map = new Map<string, ExportImageAsset>();
  const noise = Buffer.alloc(1200 * 800 * 3);
  let seed = 20261029;
  for (let index = 0; index < count; index += 1) {
    seed = fillStressNoise(noise, seed);
    const data = await sharp(noise, { raw: { width: 1200, height: 800, channels: 3 } })
      .jpeg({ quality: 70 })
      .toBuffer();
    map.set(`https://example.invalid/esfuerzo-${index}.jpg`, {
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      mimeType: "image/jpeg",
      extension: "jpg",
      width: 1200,
      height: 800,
    });
  }
  return map;
}
