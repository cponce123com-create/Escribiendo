import { describe, expect, it } from "vitest";
import { esEsquemaDesactualizado } from "./schema";

describe("esEsquemaDesactualizado", () => {
  it("reconoce el error de Prisma cuando falta una columna", () => {
    const error = {
      code: "P2022",
      message:
        "Invalid `prisma.session.findFirst()` invocation: The column `sessions.workspaceId` does not exist in the current database.",
      meta: { modelName: "Session", column: "sessions.workspaceId" },
    };

    expect(esEsquemaDesactualizado(error)).toBe(true);
  });

  it("reconoce el error de Prisma cuando falta una tabla", () => {
    expect(esEsquemaDesactualizado({ code: "P2021" })).toBe(true);
  });

  it("reconoce el mensaje aunque no venga el código", () => {
    expect(
      esEsquemaDesactualizado({ message: 'column "sessions.workspaceId" does not exist' }),
    ).toBe(true);
  });

  it("no confunde otros errores con un esquema antiguo", () => {
    expect(esEsquemaDesactualizado(new Error("algo ha ido mal"))).toBe(false);
    expect(esEsquemaDesactualizado({ code: "P2002" })).toBe(false);
    expect(esEsquemaDesactualizado(null)).toBe(false);
    expect(esEsquemaDesactualizado("texto")).toBe(false);
  });
});
