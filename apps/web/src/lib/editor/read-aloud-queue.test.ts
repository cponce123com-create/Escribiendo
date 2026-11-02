import { describe, expect, it } from "vitest";
import {
  createReadAloudQueue,
  isReadAloudPayloadWithinLimit,
  MAX_READ_ALOUD_PAYLOAD_BYTES,
  toNativeReadAloudSections,
} from "./read-aloud-queue";

const sections = [
  { id: "front", title: "Dedicatoria", text: "Para mi familia." },
  { id: "one", title: "Capítulo 1", text: "Primera escena." },
  { id: "two", title: "Capítulo 2", text: "Segunda escena." },
];

describe("createReadAloudQueue", () => {
  it("lee solo la sección actual cuando se elige capítulo", () => {
    expect(createReadAloudQueue(sections, "one", "chapter")).toEqual([sections[1]]);
  });

  it("continúa desde la sección activa hasta el final del libro", () => {
    expect(createReadAloudQueue(sections, "one", "book")).toEqual(sections.slice(1));
  });

  it("devuelve una cola vacía si la sección activa ya no existe", () => {
    expect(createReadAloudQueue(sections, "removed", "book")).toEqual([]);
  });

  it("aplica el límite de carga antes de enviar una cola grande al teléfono", () => {
    expect(isReadAloudPayloadWithinLimit("Libro", sections)).toBe(true);
    expect(
      isReadAloudPayloadWithinLimit("Libro", [
        { id: "large", title: "Capítulo", text: "x".repeat(MAX_READ_ALOUD_PAYLOAD_BYTES) },
      ]),
    ).toBe(false);
  });
});

describe("toNativeReadAloudSections", () => {
  it("limpia espacios y excluye secciones sin párrafos legibles", () => {
    expect(
      toNativeReadAloudSections([
        { id: "empty", title: "Vacío", paragraphs: [{ text: "  " }] },
        {
          id: "chapter",
          title: "Capítulo 1",
          paragraphs: [{ text: "  Una   escena.  " }, { text: "" }, { text: "Otra escena." }],
        },
      ]),
    ).toEqual([
      {
        id: "chapter",
        title: "Capítulo 1",
        paragraphs: ["Una escena.", "Otra escena."],
        text: "Una escena.\n\nOtra escena.",
      },
    ]);
  });
});
