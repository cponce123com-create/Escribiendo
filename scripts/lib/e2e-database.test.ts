import { afterEach, describe, expect, it } from "vitest";
import { assertDisposableDatabase, databaseHost, databaseName } from "./e2e-database";

const LOCAL = "postgresql://usuario:clave@127.0.0.1:5433/escribiendo_test";
const REMOTO = "postgresql://usuario:clave@db.neon.tech:5432/escribiendo_test";

describe("lectura de la URL de la base de datos", () => {
  it("extrae el nombre y el host", () => {
    expect(databaseName(LOCAL)).toBe("escribiendo_test");
    expect(databaseHost(LOCAL)).toBe("127.0.0.1");
  });

  it("devuelve cadenas vacías si la URL no es válida", () => {
    expect(databaseName("no-es-una-url")).toBe("");
    expect(databaseHost("no-es-una-url")).toBe("");
  });
});

describe("assertDisposableDatabase", () => {
  afterEach(() => {
    delete process.env.E2E_ALLOW_NON_TEST_DATABASE;
    delete process.env.E2E_ALLOW_REMOTE_DATABASE;
  });

  it("deja pasar una base local cuyo nombre parece de pruebas", () => {
    expect(() => assertDisposableDatabase(LOCAL)).not.toThrow();
  });

  it("detiene una base remota aunque su nombre parezca de pruebas", () => {
    expect(() => assertDisposableDatabase(REMOTO)).toThrow(/no es local/u);
  });

  it("detiene una base local cuyo nombre no parece de pruebas", () => {
    expect(() =>
      assertDisposableDatabase("postgresql://usuario:clave@127.0.0.1:5433/escribiendo"),
    ).toThrow(/no parece de pruebas/u);
  });

  it("las dos anulaciones son independientes", () => {
    // Levantar la del nombre no levanta la del host: una base remota con
    // nombre de pruebas sigue parando la suite.
    process.env.E2E_ALLOW_NON_TEST_DATABASE = "1";
    expect(() => assertDisposableDatabase(REMOTO)).toThrow(/no es local/u);

    // Y al revés: levantar la del host no borra la del nombre.
    delete process.env.E2E_ALLOW_NON_TEST_DATABASE;
    process.env.E2E_ALLOW_REMOTE_DATABASE = "1";
    expect(() =>
      assertDisposableDatabase("postgresql://usuario:clave@127.0.0.1:5433/escribiendo"),
    ).toThrow(/no parece de pruebas/u);
  });

  it("con las dos anulaciones deja pasar una base remota desechable", () => {
    process.env.E2E_ALLOW_NON_TEST_DATABASE = "1";
    process.env.E2E_ALLOW_REMOTE_DATABASE = "1";

    expect(() => assertDisposableDatabase(REMOTO)).not.toThrow();
  });

  it("rechaza una URL que no es de PostgreSQL", () => {
    expect(() => assertDisposableDatabase("no-es-una-url")).toThrow(/PostgreSQL/u);
  });
});
