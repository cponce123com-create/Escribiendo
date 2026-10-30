import { expect, it } from "vitest";
import { buildDocx, buildEpub } from "../../packages/export-engine/src/index";
import { zipEntries } from "../../packages/export-engine/src/test-utils";
import {
  documentoDePrueba,
  FECHA,
  imagenesDePrueba,
  textosEsperados,
  textosFaltantes,
} from "./export-fixtures";

function entryText(bytes: Uint8Array, name: string): string {
  const entry = zipEntries(bytes).get(name);
  if (!entry) throw new Error(`Falta ${name}`);
  return new TextDecoder().decode(entry.data);
}

it("valida todos los textos y tolera saltos del lector sin ocultar pérdidas", () => {
  const expected = textosEsperados().join(" ");
  expect(textosFaltantes(expected.replaceAll(" ", "\n"))).toEqual([]);
  expect(
    textosFaltantes(expected.replace("La nota explica el detalle.", "Nota perdida")),
  ).toContain("La nota explica el detalle.");
  expect(textosFaltantes(expected.replaceAll("caía", "caia"))).toContain(
    "El velo de la tarde caía sobre la plaza.",
  );
});

it("el fixture comprueba índice anidado, página legal, imagen y notas con los motores reales", () => {
  const document = documentoDePrueba();
  const epub = buildEpub(document, FECHA, imagenesDePrueba());
  const nav = entryText(epub, "EPUB/nav.xhtml")!;
  expect(nav).toContain("#apartado-reloj");
  expect(nav).toContain("#detalle-hora");
  expect(nav).toContain("<ol><li>");
  expect(nav).not.toContain("....");
  const docx = buildDocx(document, FECHA, imagenesDePrueba());
  expect(entryText(docx, "word/footnotes.xml")).toContain("La nota explica el detalle.");
  expect(entryText(docx, "word/document.xml")).toContain("Pie de la imagen de prueba");
  expect(document.chapters[0]?.blocks.some((block) => block.text.includes("ISBN"))).toBe(false);
  expect(document.chapters[0]?.blocks.some((block) => block.text.includes("©"))).toBe(true);
});
