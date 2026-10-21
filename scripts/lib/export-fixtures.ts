/**
 * Manuscrito de prueba para validar las exportaciones.
 *
 * El modelo es el mismo que consume el motor de exportación: capítulos con
 * títulos, párrafos con formato en línea, una cita, un separador, una llamada
 * con su nota al pie y una imagen incrustada. Sirve para comprobar que los
 * formatos que la aplicación escribe son los que las herramientas externas
 * leen.
 */
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
  return {
    title: "Libro de prueba",
    author: "Ana Torres",
    language: "es",
    identifier: "urn:uuid:6f1c0f6e-3f2b-4f4a-9d1e-1b2c3d4e5f60",
    chapters: [
      {
        id: "capitulo-1",
        title: "Prólogo",
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
            text: "Texto con formatos: negrita, cursiva, subrayado, tachado, superíndice, subíndice y enlace.",
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
          { kind: "heading", text: "El reloj" },
          { kind: "body", text: "Marcaba las siete y media de la tarde." },
          { kind: "pageBreak", text: "" },
          { kind: "body", text: "Segunda parte del capítulo." },
        ],
      },
    ],
  };
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
