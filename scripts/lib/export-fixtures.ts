/**
 * Manuscrito de prueba para validar las exportaciones.
 *
 * El modelo es el mismo que consume el motor de exportación: capítulos con
 * títulos, párrafos con formato en línea, una cita, un separador, una llamada
 * con su nota al pie y una imagen incrustada. Sirve para comprobar que los
 * formatos que la aplicación escribe son los que las herramientas externas
 * leen.
 */
import { buildLegalPage } from "../../packages/templates/src/index";
import type { ExportDocumentModel, ExportImageMap } from "../../packages/export-engine/src/index";

/** JPEG de un píxel, válido y mínimo, para probar la incrustación de imágenes. */
export const JPEG_UN_PIXEL = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

/** URL de la imagen de prueba. */
export const IMAGEN_SRC = "https://res.cloudinary.com/demo/image/upload/libro.jpg";

/** Documento de prueba con todo lo que el motor sabe escribir. */
export function documentoDePrueba(): ExportDocumentModel {
  const document: ExportDocumentModel = {
    title: "Libro de prueba",
    author: "Ana Torres",
    language: "es",
    identifier: "urn:uuid:6f1c0f6e-3f2b-4f4a-9d1e-1b2c3d4e5f60",
    chapters: [
      {
        id: "capitulo-1",
        title: "Prólogo",
        dropCap: true,
        blocks: [
          { kind: "title", text: "Prólogo" },
          {
            kind: "body",
            text: "El velo de la tarde caía sobre la plaza.",
            runs: [
              { text: "El velo de la tarde " },
              { text: "caía", italic: true },
              { text: " sobre la plaza." },
            ],
          },
          {
            kind: "body",
            text: "Texto con formatos: negrita, cursiva, subrayado, tachado, superíndice, subíndice y un enlace.",
            runs: [
              { text: "Texto con formatos: " },
              { text: "negrita", bold: true },
              { text: ", " },
              { text: "cursiva", italic: true },
              { text: ", " },
              { text: "subrayado", underline: true },
              { text: ", " },
              { text: "tachado", strike: true },
              { text: ", " },
              { text: "super", superscript: true },
              { text: "índice, " },
              { text: "sub", subscript: true },
              { text: "índice y un " },
              { text: "enlace", link: "https://ejemplo.test/lector" },
              { text: "." },
            ],
          },
          {
            kind: "body",
            text: "Una llamada con su nota al pie.",
            runs: [
              { text: "Una llamada con su nota al pie" },
              {
                text: "",
                footnote: { id: "nota-1", number: 1, note: "La nota explica el detalle." },
              },
              { text: "." },
            ],
          },
          { kind: "quote", text: "Cita breve: «El tiempo también se escribe»." },
          { kind: "rule", text: "" },
          {
            kind: "image",
            text: "Una imagen de prueba",
            image: {
              src: IMAGEN_SRC,
              alt: "Una imagen de prueba",
              caption: "Pie de la imagen de prueba",
            },
          },
        ],
      },
      {
        id: "capitulo-2",
        title: "Capítulo",
        blocks: [
          { id: "apartado-reloj", kind: "heading", level: 2, text: "El reloj" },
          { id: "detalle-hora", kind: "heading", level: 3, text: "La hora exacta" },
          { kind: "body", text: "Marcaba las siete y media de la tarde." },
          { kind: "pageBreak", text: "" },
          { kind: "body", text: "Segunda parte del capítulo." },
        ],
      },
      {
        id: "dedicatoria",
        title: "Dedicatoria",
        blocks: [{ kind: "body", text: "A quienes escriben incluso cuando cuesta." }],
      },
    ],
  };
  const entries = [
    { sourceId: "capitulo-1", sectionId: "capitulo-1", title: "Prólogo", level: 1 },
    { sourceId: "capitulo-2", sectionId: "capitulo-2", title: "Capítulo", level: 1 },
    { sourceId: "apartado-reloj", sectionId: "capitulo-2", title: "El reloj", level: 2 },
    { sourceId: "detalle-hora", sectionId: "capitulo-2", title: "La hora exacta", level: 3 },
  ];
  document.toc = { title: "Contenido", entries };
  const legal = buildLegalPage({
    template: "copyright-minimal",
    title: document.title,
    author: document.author,
    rightsHolder: document.author,
    copyrightYear: 2026,
  });
  if (!legal.ready) throw new Error("La página legal de prueba debe estar completa.");
  document.chapters.unshift(
    {
      id: "legal",
      title: "Página legal",
      showTitle: false,
      blocks: legal.blocks.map((block) => ({ kind: "body", text: block.text })),
    },
    {
      id: "indice",
      title: "Contenido",
      blocks: entries.map((entry) => ({
        kind: "body",
        text: entry.title,
        toc: { title: entry.title, level: entry.level, label: "", leaders: false },
      })),
    },
  );
  return document;
}

/** Textos que deben conservar todos los lectores externos. */
export function textosEsperados(): string[] {
  return documentoDePrueba()
    .chapters.flatMap((chapter) => [
      ...(chapter.showTitle === false ? [] : [chapter.title]),
      ...chapter.blocks.flatMap((block) => [
        ...(block.kind === "rule" || block.kind === "pageBreak" || block.kind === "image"
          ? []
          : block.runs?.some((run) => run.footnote)
            ? block.runs
                .filter((run) => !run.footnote && /\p{L}/u.test(run.text))
                .map((run) => run.text.trim())
            : [block.text]),
        ...(block.image?.caption ? [block.image.caption] : []),
        ...(block.runs?.flatMap((run) => (run.footnote ? [run.footnote.note] : [])) ?? []),
      ]),
    ])
    .filter(Boolean);
}

/** Tolera espacios y saltos del lector; conserva letras, acentos y signos. */
export function textosFaltantes(text: string): string[] {
  const normalize = (value: string) => value.normalize("NFC").replace(/\s+/gu, "");
  const content = normalize(text);
  return textosEsperados().filter((expected) => !content.includes(normalize(expected)));
}

/** Imágenes ya resueltas, como las que entrega la capa web. */
export function imagenesDePrueba(): ExportImageMap {
  return new Map([
    [
      IMAGEN_SRC,
      {
        src: IMAGEN_SRC,
        data: new Uint8Array(JPEG_UN_PIXEL),
        mimeType: "image/jpeg",
        extension: "jpg",
        width: 1,
        height: 1,
      },
    ],
  ]);
}

/** Fecha fija: los archivos deben ser reproducibles. */
export const FECHA = new Date("2026-10-20T10:00:00.000Z");
