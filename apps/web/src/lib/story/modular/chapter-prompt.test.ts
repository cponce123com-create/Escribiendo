import { describe, expect, it } from "vitest";
import { buildPlannedChapterPrompt } from "./chapter-prompt";
import type { MasterSnapshot } from "@/lib/story/writing/brief";

const items = [
  {
    id: "part",
    parentId: null,
    kind: "ACT",
    title: "Parte I",
    summary: "Regreso",
    goal: null,
    conflict: null,
    outcome: null,
    targetWords: null,
  },
  {
    id: "ch1",
    parentId: "part",
    kind: "CHAPTER",
    title: "La estación",
    summary: "Elena vuelve a Lima.",
    goal: "Presentar la decisión",
    conflict: "Teme encontrar a su hermano",
    outcome: "Decide quedarse",
    targetWords: 1800,
  },
  {
    id: "scene1",
    parentId: "ch1",
    kind: "SCENE",
    title: "Llegada",
    summary: "Elena baja del autobús.",
    goal: null,
    conflict: null,
    outcome: null,
    targetWords: null,
  },
  {
    id: "ch2",
    parentId: "part",
    kind: "CHAPTER",
    title: "La llamada",
    summary: null,
    goal: null,
    conflict: null,
    outcome: null,
    targetWords: null,
  },
] as const;

const master = {
  title: "Regreso",
  author: "Autora",
  genre: "Drama",
  premise: "Volver obliga a elegir.",
  literaryMovement: "Realismo",
  narrator: "Tercera persona",
  tense: "Pasado",
  tone: "Íntimo",
  audience: "Adultos",
  rules: "El hermano vive en Lima.",
  sections: [],
} as MasterSnapshot;

describe("buildPlannedChapterPrompt", () => {
  it("mantiene el título y limita el desarrollo al capítulo seleccionado", () => {
    const prompt = buildPlannedChapterPrompt({
      bookTitle: "Regreso",
      items,
      chapterId: "ch1",
      master,
    });
    expect(prompt).toContain("Título obligatorio: La estación");
    expect(prompt).toContain("No añadas, elimines, renombres ni reordenes partes o capítulos");
    expect(prompt).toContain("CAPÍTULO: La estación");
    expect(prompt).toContain("1. Llegada — Elena baja del autobús.");
    expect(prompt).toContain("Reglas y hechos aprobados: El hermano vive en Lima.");
    expect(prompt).not.toContain("DATOS APROBADOS DE ESTE CAPÍTULO\nResumen: No definido");
  });

  it("marca vacíos cuando no hay ficha maestra y rechaza una tarjeta que no es capítulo", () => {
    const prompt = buildPlannedChapterPrompt({
      bookTitle: "Regreso",
      items,
      chapterId: "ch2",
      master: null,
    });
    expect(prompt).toContain("No hay una ficha maestra vigente y aprobada");
    expect(prompt).toContain("Resumen: No definido. No inventes este dato");
    expect(() =>
      buildPlannedChapterPrompt({ bookTitle: "Regreso", items, chapterId: "part", master: null }),
    ).toThrow("Selecciona un capítulo vigente");
  });
});
