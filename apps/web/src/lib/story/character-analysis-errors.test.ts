import { describe, expect, it } from "vitest";
import { characterAnalysisError } from "./character-analysis-errors";

describe("errores del análisis de personajes", () => {
  it.each(["P2021", "P2022"])("explica cómo resolver la migración %s", (code) => {
    expect(characterAnalysisError({ code, message: "detalle interno" })).toContain(
      "pnpm db:migrate",
    );
  });

  it("reconoce el error de tabla ausente y no muestra detalles internos", () => {
    expect(
      characterAnalysisError(new Error('relation "character_analysis_tasks" does not exist')),
    ).toContain("pnpm db:migrate");
  });

  it("resume otros errores sin filtrar datos técnicos", () => {
    expect(characterAnalysisError(new Error("database password secret"))).toBe(
      "No se pudo completar el análisis de personajes. Inténtalo de nuevo.",
    );
    expect(characterAnalysisError(null)).toBe(
      "No se pudo completar el análisis de personajes. Inténtalo de nuevo.",
    );
  });
});
