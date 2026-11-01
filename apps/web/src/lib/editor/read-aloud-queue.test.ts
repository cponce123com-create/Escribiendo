import { describe, expect, it } from "vitest";
import { createReadAloudQueue } from "./read-aloud-queue";

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
});
