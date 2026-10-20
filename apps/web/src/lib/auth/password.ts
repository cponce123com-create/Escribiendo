import type { Options, ParsedHashOptions } from "@node-rs/argon2";

// @node-rs/argon2 declara Algorithm y Version como const enums ambientales,
// incompatibles con isolatedModules. Se usan sus valores numéricos estables
// (Argon2id = 2, versión 0x13 = 1) con el tipo Options como comprobación.
const ARGON2_ALGORITHM_ID = 2;
const ARGON2_VERSION_ID = 1;

const ARGON2_POLICY = {
  algorithm: ARGON2_ALGORITHM_ID,
  version: ARGON2_VERSION_ID,
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} satisfies Options;

/**
 * Superficie de la API que usa la aplicación. Se declara de forma explícita
 * para evitar anotaciones de tipo `typeof import(...)`, que la regla
 * `consistent-type-imports` no permite, sin perder la comprobación de tipos
 * en cada llamada.
 */
interface Argon2Api {
  hash(password: string, options?: Options): Promise<string>;
  verify(hashedPassword: string, password: string): Promise<boolean>;
  parseOptions(hashedPassword: string): ParsedHashOptions;
}

// La carga diferida evita que `next build` evalúe el binding nativo y permite
// que la compilación funcione en un equipo sin el binario de la plataforma.
// En ejecución, @node-rs/argon2 elige el binario nativo o su respaldo WASI.
let argon2ModulePromise: Promise<Argon2Api> | undefined;

function loadArgon2(): Promise<Argon2Api> {
  argon2ModulePromise ??= import("@node-rs/argon2") as Promise<Argon2Api>;
  return argon2ModulePromise;
}

const MAX_PASSWORD_BYTES = 512;

let dummyHashPromise: Promise<string> | undefined;

export async function hashPassword(password: string): Promise<string> {
  const { hash } = await loadArgon2();
  return hash(password, ARGON2_POLICY);
}

export async function verifyPassword(hashedPassword: string, password: string): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return false;
  }

  try {
    const { verify } = await loadArgon2();
    return await verify(hashedPassword, password);
  } catch {
    return false;
  }
}

export async function verifyWithDummyHash(password: string): Promise<false> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("dummy-password-for-timing-only");
  }

  const dummyHash = await dummyHashPromise;

  try {
    const { verify } = await loadArgon2();
    await verify(dummyHash, password);
  } catch {
    // El resultado se ignora deliberadamente.
  }

  return false;
}

export async function passwordNeedsRehash(hashedPassword: string): Promise<boolean> {
  try {
    const { parseOptions } = await loadArgon2();
    const parsed = parseOptions(hashedPassword);

    return (
      parsed.algorithm !== ARGON2_POLICY.algorithm ||
      parsed.version !== ARGON2_POLICY.version ||
      parsed.memoryCost < ARGON2_POLICY.memoryCost ||
      parsed.timeCost < ARGON2_POLICY.timeCost ||
      parsed.parallelism !== ARGON2_POLICY.parallelism ||
      parsed.outputLen !== ARGON2_POLICY.outputLen ||
      parsed.saltLen < 16
    );
  } catch {
    return true;
  }
}
