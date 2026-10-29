import { expect, it } from "vitest";
import {
  buildWritingGuide,
  masterChanged,
  masterFieldsSchema,
  chapterFieldsSchema,
  type MasterSnapshot,
  type ChapterSnapshot,
} from "./brief";
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const master: MasterSnapshot = {
  premise: "Una historia de regreso.",
  literaryMovement: "",
  narrator: "Primera persona",
  tense: "Pasado",
  tone: "Íntimo",
  audience: "",
  rules: "Conservar los títulos.",
  title: "Libro aprobado",
  author: "Autor aprobado",
  genre: "Novela",
  sections: [1, 2, 3, 4, 5].map((n) => ({ id: id(n), title: `Capítulo ${n} · Título exacto` })),
};
const chapter: ChapterSnapshot = {
  objective: "Mostrar una decisión",
  startingPoint: "Situación establecida",
  scenes: "1. Conversación\n2. Decisión",
  endingPoint: "La decisión queda tomada.",
  restrictions: "No adelantar el viaje.",
  characterNotes: "",
  writtenSummary: "",
  characterIds: [],
  worldIds: [],
  title: master.sections[3]!.title,
  masterVersion: 1,
  sourceVersion: 1,
  context: "Personaje: Ana. Ficha aprobada.",
};
const input = () => ({
  master: { version: 1, status: "APPROVED", content: structuredClone(master) },
  chapter: { version: 2, status: "APPROVED", content: structuredClone(chapter) },
  sectionId: id(4),
  mode: "complete" as const,
  sections: master.sections.map((s, n) => ({
    ...s,
    version: 1,
    brief: {
      version: 1,
      status: "APPROVED",
      content: { ...chapter, title: s.title, writtenSummary: `HECHO_UNICO_${n + 1}` },
    },
  })),
});
it("conserva títulos y reglas exactos sin incorporar resúmenes presentes ni futuros", () => {
  const text = buildWritingGuide(input());
  expect(text).toContain("CAPÍTULO A DESARROLLAR: Capítulo 4 · Título exacto");
  expect(text).toContain("HECHO_UNICO_1");
  expect(text).toContain("HECHO_UNICO_3");
  expect(text).not.toContain("HECHO_UNICO_4");
  expect(text).not.toContain("HECHO_UNICO_5");
  expect(text).toContain("No adelantar el viaje.");
  expect(text).toContain("Corriente literaria:\nNo especificado");
});
it("distingue el modo breve del completo y declara el alcance", () => {
  const data = input();
  data.sectionId = id(5);
  data.chapter.content.title = master.sections[4]!.title;
  const brief = buildWritingGuide({ ...data, mode: "brief" });
  expect(brief).not.toContain("HECHO_UNICO_1");
  expect(brief).toContain("HECHO_UNICO_2");
  expect(brief).toContain("hasta tres secciones previas");
  expect(buildWritingGuide(data)).toContain("HECHO_UNICO_1");
});
it("no inventa acontecimientos cuando el resumen falta, es borrador o el manuscrito cambió", () => {
  const data = input();
  data.sections[0]!.version = 2;
  data.sections[1]!.brief.status = "DRAFT";
  data.sections[2]!.brief.content.writtenSummary = "";
  const text = buildWritingGuide(data);
  expect(text).not.toContain("HECHO_UNICO_");
  expect(text.match(/Sin resumen vigente aprobado/gu)).toHaveLength(3);
});
it.each(["master", "chapter"] as const)("no usa %s sin aprobar", (key) => {
  const data = input();
  data[key].status = "DRAFT";
  expect(() => buildWritingGuide(data)).toThrow("Aprueba");
});
it("bloquea una guía referida a otra ficha maestra o a un título anterior", () => {
  const data = input();
  data.master.version = 2;
  expect(() => buildWritingGuide(data)).toThrow("ficha maestra cambió");
  data.master.version = 1;
  data.chapter.content.title = "Título inventado";
  expect(() => buildWritingGuide(data)).toThrow("título del capítulo cambió");
});
it("detecta renombrado, cambio de autoría y reordenación incluso con títulos repetidos", () => {
  const book = { title: master.title, authorName: master.author, genre: master.genre };
  expect(masterChanged(master, book, master.sections)).toBe(false);
  expect(masterChanged(master, { ...book, authorName: "Otra persona" }, master.sections)).toBe(
    true,
  );
  expect(masterChanged(master, book, [...master.sections].reverse())).toBe(true);
  expect(
    masterChanged(
      master,
      book,
      master.sections.map((s, i) => (i ? s : { ...s, title: "Nuevo" })),
    ),
  ).toBe(true);
});
it("rechaza controles y selecciones ajenas al formato sin adivinar datos", () => {
  const fields = {
    premise: "",
    literaryMovement: "",
    narrator: "",
    tense: "",
    tone: "",
    audience: "",
    rules: "",
  };
  expect(masterFieldsSchema.safeParse(fields).success).toBe(true);
  expect(masterFieldsSchema.safeParse({ ...fields, premise: "Hola\u0007" }).success).toBe(false);
  expect(chapterFieldsSchema.safeParse({ ...chapter, characterIds: ["id-ajeno"] }).success).toBe(
    false,
  );
});
it("rechaza una guía demasiado grande sin cortar el contexto en silencio", () => {
  const data = input();
  data.sections = Array.from({ length: 80 }, (_, n) => ({
    id: id(n + 1),
    title: `Capítulo ${n + 1}`,
    version: 1,
    brief: {
      version: 1,
      status: "APPROVED",
      content: { ...chapter, title: `Capítulo ${n + 1}`, writtenSummary: "a".repeat(2000) },
    },
  }));
  data.sectionId = id(80);
  data.chapter.content.title = "Capítulo 80";
  expect(() => buildWritingGuide(data)).toThrow("no se ha recortado");
});
