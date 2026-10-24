import { expect, it } from "vitest";
import { detectImportSections, isImportHeading } from "./import-detection";
it("conserva el rótulo y el título de un capítulo en líneas consecutivas", () => {
  const sections = detectImportSections(
    [
      { text: "Capítulo I", headingLevel: 1 },
      { text: "Los árboles de Huagapo", headingLevel: 1 },
      { text: "El bosque despertó." },
    ],
    "Manuscrito",
  );
  expect(sections).toHaveLength(1);
  expect(sections[0]?.title).toBe("Capítulo I — Los árboles de Huagapo");
  expect(sections[0]?.paragraphs).toEqual(["El bosque despertó."]);
});
it("distingue partes, dedicatorias y prólogos, sin perder partes sin texto", () => {
  const sections = detectImportSections(
    [
      { text: "Dedicatoria", heading: true },
      { text: "Para Ana." },
      { text: "Prólogo", heading: true },
      { text: "Antes de comenzar." },
      { text: "Parte I", heading: true },
      { text: "Capítulo 1", heading: true },
      { text: "Comienza la aventura." },
    ],
    "Manuscrito",
  );
  expect(sections.map((section) => section.type)).toEqual([
    "DEDICATION",
    "PROLOGUE",
    "PART",
    "CHAPTER",
  ]);
  expect(sections[2]?.content.content).toEqual([{ type: "paragraph" }]);
});
it("no convierte subtítulos ni frases del cuerpo en capítulos", () => {
  expect(isImportHeading("Capítulo tras capítulo, la historia se hizo más extensa.")).toBe(false);
  const sections = detectImportSections(
    [
      { text: "Capítulo 1", headingLevel: 1 },
      { text: "El viaje", headingLevel: 2 },
      { text: "Texto." },
      { text: "Al llegar", headingLevel: 2 },
      { text: "Más texto." },
    ],
    "Manuscrito",
  );
  expect(sections).toHaveLength(1);
  expect(sections[0]?.content.content[0]?.type).toBe("heading");
  expect(sections[0]?.paragraphs).toEqual(["El viaje", "Texto.", "Al llegar", "Más texto."]);
});

it("las anclas del índice separan capítulos aunque exista una cabecera de mayor nivel", () => {
  const sections = detectImportSections(
    [
      { text: "Portadilla", headingLevel: 1, sectionType: "TITLE_PAGE" },
      { text: "La partida", headingLevel: 2, boundary: true },
      { text: "Inicio." },
      { text: "El regreso", headingLevel: 2, boundary: true },
      { text: "Final." },
    ],
    "Manuscrito",
  );
  expect(sections.map((section) => section.title)).toEqual([
    "Portadilla",
    "La partida",
    "El regreso",
  ]);
});
