import { describe, expect, it } from "vitest";
import { COLUMNAS_ESPERADAS, missingColumns } from "./expected-schema";

describe("missingColumns", () => {
  it("no devuelve nada cuando están todas las columnas", () => {
    const disponibles = COLUMNAS_ESPERADAS.map((columna) => ({ ...columna }));

    expect(missingColumns(disponibles)).toEqual([]);
  });

  it("nombra la columna que falta", () => {
    const disponibles = COLUMNAS_ESPERADAS.filter(
      (columna) => !(columna.tabla === "sessions" && columna.columna === "workspaceId"),
    );

    expect(missingColumns(disponibles)).toEqual([{ tabla: "sessions", columna: "workspaceId" }]);
  });

  it("distingue mayúsculas: los identificadores de PostgreSQL las conservan", () => {
    const disponibles = COLUMNAS_ESPERADAS.map((columna) => ({
      ...columna,
      columna: columna.columna.toLowerCase(),
    }));
    const columnasConMayusculas = COLUMNAS_ESPERADAS.filter(
      (columna) => columna.columna !== columna.columna.toLowerCase(),
    );

    expect(missingColumns(disponibles)).toEqual(columnasConMayusculas);
  });

  it("no muta la lista de columnas esperadas", () => {
    const antes = COLUMNAS_ESPERADAS.map((columna) => ({ ...columna }));

    missingColumns([]);

    expect(COLUMNAS_ESPERADAS).toEqual(antes);
  });
});
