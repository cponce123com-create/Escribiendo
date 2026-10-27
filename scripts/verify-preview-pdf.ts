import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_TYPOGRAPHY_CONFIG, paginate } from "../packages/editorial-engine/src/index";
import { buildPdf } from "../packages/export-engine/src/index";
import { toPdfPages, type PdfLayoutProfile } from "../apps/web/src/lib/export/pdf-layout";

/** Texto sin espacios: el lector reparte las mismas letras de otra forma. */
function normalizar(texto: string): string {
  return texto.replace(/\s+/gu, "");
}

/**
 * Comprueba con pdf.js que el PDF contiene, página por página, el texto que
 * compuso la vista previa.
 *
 * Es la comprobación que no depende del motor de escritura: si el mapa
 * `ToUnicode`, los anchos de la fuente o el orden de dibujo fallan, el texto
 * leído deja de coincidir aunque el número de páginas siga siendo el mismo.
 */
function verificarTextoCompuesto(
  paginas: ReadonlyArray<{ runs: ReadonlyArray<{ text: string }> }>,
  archivo: string,
): void {
  const validador = path.resolve(process.cwd(), "scripts/pdfjs/valida-pdf.mjs");
  const lectura = spawnSync(process.execPath, [validador, archivo, "--json"], { encoding: "utf8" });

  if (lectura.error || lectura.status !== 0) {
    throw new Error(
      `No se pudo leer el PDF con pdf.js. Instala el lector con «pnpm --dir scripts/pdfjs install».\n${lectura.stderr ?? lectura.error?.message ?? ""}`,
    );
  }

  const { paginas: leidas } = JSON.parse(lectura.stdout) as { paginas: string[] };

  if (leidas.length !== paginas.length) {
    throw new Error(
      `pdf.js lee ${leidas.length} páginas y la vista previa compuso ${paginas.length}.`,
    );
  }

  paginas.forEach((pagina, indice) => {
    const compuesto = normalizar(pagina.runs.map((run) => run.text).join(""));
    const leido = normalizar(leidas[indice] ?? "");

    if (compuesto !== leido) {
      throw new Error(
        `La página ${indice + 1} del PDF no coincide con la composición: ` +
          `${compuesto.length} caracteres compuestos y ${leido.length} leídos.`,
      );
    }
  });
}

const profile: PdfLayoutProfile = {
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

const words = Array.from(
  { length: 2_400 },
  (_, index) =>
    ["La", "composición", "del", "libro", "respeta", "las", "métricas", "editoriales."][index % 8],
).join(" ");
const sections = [
  {
    id: "capitulo-prueba",
    kind: "chapterTitle" as const,
    text: "Capítulo de prueba",
    sectionId: "capitulo-prueba",
    sectionTitle: "Capítulo de prueba",
    startsChapter: true,
    firstOfSection: true,
  },
  {
    id: "texto-prueba",
    kind: "body" as const,
    text: words,
    sectionId: "capitulo-prueba",
    sectionTitle: "Capítulo de prueba",
    firstOfSection: false,
    dropCapCharacter: "L",
  },
];
const typography = {
  ...DEFAULT_TYPOGRAPHY_CONFIG,
};
const composition = paginate(
  sections,
  {
    pageWidthMm: profile.pageWidthMm,
    pageHeightMm: profile.pageHeightMm,
    marginTopMm: profile.marginTopMm,
    marginBottomMm: profile.marginBottomMm,
    marginInnerMm: profile.marginInnerMm,
    marginOuterMm: profile.marginOuterMm,
    gutterMm: profile.gutterMm,
    headerDistanceMm: profile.headerDistanceMm,
    footerDistanceMm: profile.footerDistanceMm,
    chapterStartsRecto: profile.chapterStartsRecto,
  },
  typography,
);
const pdfLayout = toPdfPages(composition.pages, profile, typography, new Map());
const pdf = buildPdf({
  title: "Libro de prueba",
  author: "ESCRIBIENDO",
  createdAt: new Date("2026-10-22T00:00:00.000Z"),
  pages: pdfLayout.pdfPages,
});
const pdfText = new TextDecoder().decode(pdf.bytes);
const pdfPageCount = Number(pdfText.match(/\/Type \/Pages \/Count (\d+)/u)?.[1] ?? 0);

if (pdfPageCount !== composition.pages.length) {
  throw new Error(
    `La vista previa tiene ${composition.pages.length} páginas y el PDF ${pdfPageCount}.`,
  );
}

const output = path.resolve(process.cwd(), "artifacts/vista-previa-ejemplo.pdf");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, pdf.bytes);

verificarTextoCompuesto(pdfLayout.pdfPages, output);

process.stdout.write(
  `Verificación correcta: vista previa y PDF tienen ${pdfPageCount} páginas y el texto coincide página a página.\nPDF: ${output}\n`,
);
