import { describe, expect, it } from "vitest";
import { analyzeNarrative } from "./character-analysis";
describe("analyzeNarrative", () => {
  it("reconoce candidatos, edad, evidencia y diálogo en español", () => {
    const result = analyzeNarrative([
      {
        title: "Capítulo 1",
        text: "Andrés Salazar llegó temprano. Andrés, a sus 42 años, miró el espejo. —No volveré —dijo Andrés.",
      },
    ]);
    const andres = result.find((x) => x.name === "Andrés");
    expect(andres).toBeDefined();
    expect(andres?.age).toBe("42");
    expect(andres?.evidence.some((e) => e.kind === "dialogue")).toBe(true);
    expect(andres?.evidence.every((e) => e.excerpt.length > 0)).toBe(true);
  });
  it("no extrae nombres de una sola aparición", () => {
    expect(
      analyzeNarrative([
        { title: "Prólogo", text: "El viento cubrió el valle. Marta abrió la puerta." },
      ]),
    ).toEqual([]);
  });
  it("conserva separadas las variantes de nombre ambiguas", () => {
    const r = analyzeNarrative([
      {
        title: "I",
        text: "Andrés Salazar miró atrás. Andrés siguió andando. Salazar cerró la puerta. Andrés Salazar volvió.",
      },
    ]);
    expect(r.some((x) => x.name === "Andrés Salazar")).toBe(true);
    expect(r.some((x) => x.name === "Andrés")).toBe(true);
  });
});
