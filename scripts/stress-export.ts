/** Medición aislada por formato; usa paginate y toPdfPages de la aplicación. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  type PdfFont,
  type PdfFontProgram,
} from "../packages/export-engine/src/index";
import { zipEntriesResumen } from "../packages/export-engine/src/test-utils";
import { toPdfPages, type PdfLayoutProfile } from "../apps/web/src/lib/export/pdf-layout";
import {
  MIXED_CASES,
  TEXT_CASES,
  stressManuscript,
  stressImages,
  type StressCase,
} from "./lib/stress-fixture";

const FORMATS = ["pdf", "epub", "docx"] as const;
type Format = (typeof FORMATS)[number];
const PROFILE: PdfLayoutProfile = {
  pageWidthMm: 148,
  pageHeightMm: 210,
  marginTopMm: 20,
  marginBottomMm: 20,
  marginInnerMm: 18,
  marginOuterMm: 14,
  gutterMm: 0,
  bleedMm: 0,
  headerDistanceMm: 10,
  footerDistanceMm: 10,
  mirrorMargins: true,
  showPageNumbers: true,
  chapterStartsRecto: true,
};
const TYPOGRAPHY = withTypographyDefaults({});
const DATE = new Date("2026-10-29T00:00:00.000Z");
const SCRIPT = fileURLToPath(import.meta.url);
const CASES = process.argv.includes("--profile=text") ? TEXT_CASES : MIXED_CASES;

function loadFonts(): { fonts: PdfFontProgram[]; measure: MeasureText } {
  const files = {
    regular: "Regular",
    bold: "Bold",
    italic: "Italic",
    boldItalic: "BoldItalic",
  } as const;
  const faces = new Map(
    Object.entries(files).map(([style, file]) => {
      const data = new Uint8Array(
        readFileSync(path.resolve(`apps/web/public/fonts/liberation/LiberationSerif-${file}.ttf`)),
      );
      return [style, parseTrueTypeFont(data, `LiberationSerif-${file}`)] as const;
    }),
  );
  const fonts: PdfFontProgram[] = [...faces].map(([style, face]) => ({
    family: "serif",
    style: style as PdfFont,
    name: `LiberationSerif-${files[style as PdfFont]}`,
    data: face.data,
  }));
  const measure: MeasureText = (text, options) => {
    const style = options.bold
      ? options.italic
        ? "boldItalic"
        : "bold"
      : options.italic
        ? "italic"
        : "regular";
    return measureTrueTypeTextPoints(
      faces.get(style)!,
      options.uppercase ? text.toLocaleUpperCase("es") : text,
      options.fontSizePt,
      options.letterSpacingPt ?? 0,
    );
  };
  return { fonts, measure };
}

async function worker(config: StressCase, format: Format): Promise<void> {
  const started = performance.now();
  const baselineRssMb = process.memoryUsage().rss / 1024 / 1024;
  const { chapters, blocks } = stressManuscript(config);
  const assets = await stressImages(config.images);
  const model = {
    title: "Manuscrito sintético de esfuerzo",
    author: "Pruebas",
    language: "es",
    identifier: "urn:uuid:00000000-0000-4000-8000-000000000000",
    chapters,
  };
  let pages: number | null = null,
    paginateMs = 0,
    composeMs = 0,
    embeddedImages = 0,
    composedFootnotes: number | null = null;
  let bytes: Uint8Array;
  const exportStarted = performance.now();
  if (format === "pdf") {
    const { fonts, measure } = loadFonts();
    let stage = performance.now();
    const composition = paginate(blocks, PROFILE, TYPOGRAPHY, measure);
    paginateMs = performance.now() - stage;
    pages = composition.pages.length;
    composedFootnotes = composition.pages.reduce((sum, page) => sum + page.footnotes.length, 0);
    if (composedFootnotes !== config.footnotes)
      throw new Error("La composición perdió notas al pie.");
    stage = performance.now();
    const layout = toPdfPages(
      composition.pages,
      PROFILE,
      TYPOGRAPHY,
      assets,
      measure,
      null,
      model.title,
    );
    composeMs = performance.now() - stage;
    const result = buildPdf({
      title: model.title,
      author: model.author,
      createdAt: DATE,
      fonts,
      pages: layout.pdfPages,
    });
    bytes = result.bytes;
    embeddedImages = result.imagenesIncrustadas;
  } else {
    bytes = format === "epub" ? buildEpub(model, DATE, assets) : buildDocx(model, DATE, assets);
    const prefix = format === "epub" ? "EPUB/images/" : "word/media/";
    embeddedImages = zipEntriesResumen(bytes).filter((entry) =>
      entry.name.startsWith(prefix),
    ).length;
  }
  const exportMs = performance.now() - exportStarted;
  if (embeddedImages !== config.images) throw new Error("La exportación perdió imágenes.");
  if (process.env.BENCHMARK_KEEP_FILES === "1") {
    const directory = path.resolve(
      process.env.BENCHMARK_OUTPUT_DIR ?? "artifacts/export-benchmark",
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, `${config.id}.${format}`), bytes);
  }
  const memory = process.memoryUsage();
  process.stdout.write(
    JSON.stringify({
      ...config,
      format,
      pages,
      embeddedImages,
      composedFootnotes,
      setupMs: exportStarted - started,
      paginateMs,
      composeMs,
      exportMs,
      totalMs: performance.now() - started,
      outputBytes: bytes.length,
      baselineRssMb,
      peakRssMb: process.resourceUsage().maxRSS / 1024,
      heapUsedMb: memory.heapUsed / 1024 / 1024,
      externalMb: memory.external / 1024 / 1024,
    }) + "\n",
  );
}

async function main(): Promise<void> {
  const workerIndex = process.argv.indexOf("--worker");
  if (workerIndex >= 0) {
    const config = CASES.find((entry) => entry.id === process.argv[workerIndex + 1]);
    const format = process.argv[workerIndex + 2] as Format;
    if (!config || !FORMATS.includes(format))
      throw new Error("Caso o formato de esfuerzo inválido.");
    await worker(config, format);
    return;
  }
  const directory = path.resolve(process.env.BENCHMARK_OUTPUT_DIR ?? "artifacts/export-benchmark");
  mkdirSync(directory, { recursive: true });
  const budget = Number(process.env.BENCHMARK_RSS_BUDGET_MB ?? "384");
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("Presupuesto RSS inválido.");
  const results: Array<Record<string, unknown>> = [];
  let failed = false;
  console.log(
    "Caso | Formato | Páginas PDF | Tiempo total ms | RSS pico MB | Dentro del presupuesto",
  );
  for (const config of CASES) {
    for (const format of FORMATS) {
      const args = [
        "--import",
        "tsx",
        SCRIPT,
        ...(process.argv.includes("--profile=text") ? ["--profile=text"] : []),
        "--worker",
        config.id,
        format,
      ];
      const child = spawnSync(process.execPath, args, {
        encoding: "utf8",
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (child.status !== 0 || child.error) {
        failed = true;
        results.push({
          ...config,
          format,
          error: child.error?.message ?? child.stderr,
          signal: child.signal,
          exitCode: child.status,
        });
        console.error(`Falló ${config.id}/${format}: ${child.stderr || child.error?.message}`);
        continue;
      }
      const result = JSON.parse(child.stdout) as {
        peakRssMb: number;
        totalMs: number;
        pages: number | null;
      };
      const withinBudget = result.peakRssMb <= budget;
      results.push({ ...result, withinBudget });
      if (!withinBudget && process.env.BENCHMARK_ENFORCE_BUDGET === "1") failed = true;
      console.log(
        `${config.id} | ${format} | ${result.pages ?? "adaptable"} | ${result.totalMs.toFixed(0)} | ${result.peakRssMb.toFixed(1)} | ${withinBudget ? "sí" : "NO"}`,
      );
    }
  }
  const report = {
    fixtureVersion: 1,
    seed: 20261029,
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    budgetRssMb: budget,
    limits:
      "Procesos aislados, datos sintéticos y recursos locales. Excluye Next.js, Prisma, red, concurrencia y estabilización de materias del libro completo. No certifica Render Free.",
    results,
  };
  const file = path.join(
    directory,
    process.argv.includes("--profile=text") ? "texto.json" : "mixto.json",
  );
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `Informe: ${file}\nCada RSS pico corresponde a un proceso independiente. No es la diferencia de heap ni memoria disponible del servidor.`,
  );
  if (failed) process.exitCode = 1;
}

await main();
