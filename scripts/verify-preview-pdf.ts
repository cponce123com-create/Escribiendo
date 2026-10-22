import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_TYPOGRAPHY_CONFIG, paginate } from "../packages/editorial-engine/src/index";
import { buildPdf } from "../packages/export-engine/src/index";
import { toPdfPages, type PdfLayoutProfile } from "../apps/web/src/lib/export/pdf-layout";

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
process.stdout.write(
  `Verificación correcta: vista previa y PDF tienen ${pdfPageCount} páginas.\nPDF: ${output}\n`,
);
