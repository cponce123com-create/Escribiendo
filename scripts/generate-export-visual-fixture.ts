import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  paginate,
  withTypographyDefaults,
  type MeasureText,
} from "../packages/editorial-engine/src/index";
import {
  buildPdf,
  parseTrueTypeFont,
  measureTrueTypeTextPoints,
  type PdfFont,
  type PdfFontProgram,
} from "../packages/export-engine/src/index";
import { toPdfPages } from "../apps/web/src/lib/export/pdf-layout";
import { stressManuscript, stressImages } from "../scripts/lib/stress-fixture";
const profile = {
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
const files = {
  regular: "Regular",
  bold: "Bold",
  italic: "Italic",
  boldItalic: "BoldItalic",
} as const;
const faces = new Map(
  Object.entries(files).map(([style, file]) => [
    style,
    parseTrueTypeFont(
      new Uint8Array(readFileSync(`apps/web/public/fonts/liberation/LiberationSerif-${file}.ttf`)),
      `LiberationSerif-${file}`,
    ),
  ]),
);
const fonts: PdfFontProgram[] = [...faces].map(([style, face]) => ({
  family: "serif",
  style: style as PdfFont,
  name: `LiberationSerif-${files[style as PdfFont]}`,
  data: face.data,
}));
const measure: MeasureText = (text, o) =>
  measureTrueTypeTextPoints(
    faces.get(o.bold ? (o.italic ? "boldItalic" : "bold") : o.italic ? "italic" : "regular")!,
    o.uppercase ? text.toLocaleUpperCase("es") : text,
    o.fontSizePt,
    o.letterSpacingPt ?? 0,
  );
const fixture = stressManuscript({
  id: "visual",
  words: 2000,
  chapters: 2,
  images: 2,
  footnotes: 4,
});
const typography = withTypographyDefaults({});
const composition = paginate(fixture.blocks, profile, typography, measure);
const layout = toPdfPages(composition.pages, profile, typography, await stressImages(2), measure);
const pdf = buildPdf({
  title: "Prueba de equivalencia visual",
  author: "Pruebas",
  createdAt: new Date("2026-10-29T00:00:00Z"),
  pages: layout.pdfPages,
  fonts,
});
const destination = path.resolve(process.argv[2] ?? "artifacts/export-visual/fixture.pdf");
if (!destination.endsWith(".pdf")) throw new Error("El destino debe ser un PDF.");
mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, pdf.bytes);
process.stdout.write(
  `${process.argv[2]}: ${composition.pages.length} páginas, ${composition.pages.reduce((n, p) => n + p.footnotes.length, 0)} notas, ${pdf.imagenesIncrustadas} imágenes\n`,
);
