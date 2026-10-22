import { describe, expect, it } from "vitest";
import {
  classifyDatabaseError,
  readErrorCode,
  readErrorName,
  schemaOutdatedState,
  type DatabaseFailure,
} from "./database-state";

const baseFailure: DatabaseFailure = {
  errorCode: "P2021",
  errorName: "PrismaClientKnownRequestError",
  errorMessage: "The table `public.users` does not exist in the current database.",
};

describe("readErrorCode", () => {
  it("lee el código de Prisma", () => {
    expect(readErrorCode({ code: "P2021" })).toBe("P2021");
    expect(readErrorCode({ errorCode: "P1001" })).toBe("P1001");
  });

  it("devuelve UNKNOWN cuando no hay código", () => {
    expect(readErrorCode(new Error("boom"))).toBe("UNKNOWN");
    expect(readErrorCode(null)).toBe("UNKNOWN");
    expect(readErrorCode("texto")).toBe("UNKNOWN");
  });
});

describe("readErrorName", () => {
  it("devuelve el nombre de la clase del error", () => {
    expect(readErrorName(new TypeError("x"))).toBe("TypeError");
    expect(readErrorName("no es un error")).toBe("UnknownError");
  });
});

describe("schemaOutdatedState", () => {
  it("describe una base que responde pero no tiene el esquema esperado", () => {
    const state = schemaOutdatedState();

    expect(state).toMatchObject({
      status: "not-migrated",
      errorCode: "P2022",
      errorName: "EsquemaDesactualizado",
    });
  });
});

describe("classifyDatabaseError", () => {
  it("clasifica P2021 como esquema sin aplicar", () => {
    const state = classifyDatabaseError(null, baseFailure);

    expect(state.status).toBe("not-migrated");
  });

  it("clasifica P2022 (columna ausente) como esquema sin aplicar", () => {
    const state = classifyDatabaseError(null, {
      ...baseFailure,
      errorCode: "P2022",
    });

    expect(state.status).toBe("not-migrated");
  });

  it("clasifica P1001 como base de datos inalcanzable", () => {
    const state = classifyDatabaseError(null, {
      ...baseFailure,
      errorCode: "P1001",
      errorName: "PrismaClientInitializationError",
    });

    expect(state.status).toBe("unavailable");
  });

  it("clasifica un error de inicialización sin código como base inalcanzable", () => {
    const state = classifyDatabaseError(null, {
      ...baseFailure,
      errorCode: "UNKNOWN",
      errorName: "PrismaClientInitializationError",
    });

    expect(state.status).toBe("unavailable");
  });

  it("clasifica cualquier otro fallo como base de datos no disponible", () => {
    const state = classifyDatabaseError(null, {
      ...baseFailure,
      errorCode: "P9999",
      errorName: "Desconocido",
    });

    expect(state.status).toBe("unavailable");
  });

  it("conserva el código y el nombre en el estado resultante", () => {
    const state = classifyDatabaseError(null, baseFailure);

    expect(state).toMatchObject({
      status: "not-migrated",
      errorCode: "P2021",
      errorName: "PrismaClientKnownRequestError",
    });
  });
});
