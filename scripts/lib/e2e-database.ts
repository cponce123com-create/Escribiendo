/**
 * Salvaguarda de las pruebas de extremo a extremo.
 *
 * Las pruebas vacían todas las tablas antes de empezar. Contra una base de
 * datos real, eso destruiría el trabajo de quien la usa, así que hay dos
 * barreras: el nombre de la base tiene que parecer de pruebas y el host tiene
 * que ser local. Cada una tiene **su propia** anulación, para que levantar
 * una no levante la otra sin querer.
 */

/** Nombre de la base de datos configurada, sin el prefijo de esquema. */
export function databaseName(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//u, "");
  } catch {
    return "";
  }
}

/** Host de la base de datos configurada. */
export function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
}

/** Hosts locales en los que sí es seguro vaciar las tablas. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/**
 * Las pruebas nunca deben ejecutarse contra una base que no sea desechable.
 *
 * Se acepta un nombre que contenga «test» o la anulación explícita
 * `E2E_ALLOW_NON_TEST_DATABASE=1`, y un host local o la anulación
 * `E2E_ALLOW_REMOTE_DATABASE=1`.
 */
export function assertDisposableDatabase(databaseUrl: string): void {
  const name = databaseName(databaseUrl);

  if (!name) {
    throw new Error("DATABASE_URL no es una URL de PostgreSQL válida.");
  }

  const looksDisposable = /test/i.test(name);

  if (!looksDisposable && process.env.E2E_ALLOW_NON_TEST_DATABASE !== "1") {
    throw new Error(
      `Se aborta: la base de datos «${name}» no parece de pruebas. ` +
        "Las pruebas de extremo a extremo borran todas las tablas. " +
        "Configura E2E_ALLOW_NON_TEST_DATABASE=1 solo si es realmente desechable.",
    );
  }

  // Segunda barrera: aunque el nombre parezca de pruebas, el host debe ser
  // local. Un `.env` que apunte a Neon, RDS o cualquier otra base remota
  // provocaría el borrado de datos reales.
  const host = databaseHost(databaseUrl);

  if (!LOCAL_HOSTS.has(host) && process.env.E2E_ALLOW_REMOTE_DATABASE !== "1") {
    throw new Error(
      `Se aborta: la base de datos «${host}» no es local. ` +
        "Las pruebas de extremo a extremo borran todas las tablas y solo " +
        "deben ejecutarse contra un PostgreSQL de la máquina. " +
        "Configura E2E_ALLOW_REMOTE_DATABASE=1 solo si la base es desechable.",
    );
  }
}
