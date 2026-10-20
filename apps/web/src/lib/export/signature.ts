import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

/**
 * Firma de las descargas de exportación.
 *
 * El archivo de una exportación no se guarda en ningún sitio: se genera en el
 * momento de descargarlo, a partir de las versiones del manuscrito que
 * guardó el trabajo. La descarga se protege con una firma de corta duración,
 * de modo que la dirección se pueda compartir un rato y luego deje de servir.
 *
 * La clave es `EXPORT_SIGNING_SECRET`. Si no está definida, se deriva de las
 * credenciales de la base de datos, que ya son un secreto y siempre están
 * presentes: así la función no depende de una variable que hay que recordar
 * configurar.
 */

/** Minutos de validez de una descarga firmada. */
export const DOWNLOAD_TTL_MINUTES = 10;

let cachedKey: Buffer | null = null;

/** Contraseña de la URL de la base de datos, si la tiene. */
function passwordFromDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);

    return decodeURIComponent(parsed.password);
  } catch {
    return "";
  }
}

/** Clave con la que se firman las descargas. */
function signingKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const env = getServerEnv();
  const configured = env.EXPORT_SIGNING_SECRET;

  if (configured && configured.length >= 32) {
    cachedKey = createHash("sha256").update(`escribiendo-export:${configured}`).digest();
    return cachedKey;
  }

  const secret = passwordFromDatabaseUrl(env.DATABASE_URL);

  cachedKey = createHash("sha256")
    .update(`escribiendo-export:${secret}:${env.DIRECT_URL ?? ""}`)
    .digest();

  return cachedKey;
}

/** Datos que se firman. */
export interface DownloadPayload {
  jobId: string;
  userId: string;
  /** Momento de expiración, en milisegundos. */
  expiresAt: number;
}

/** Firma de una descarga. */
export function signDownload(payload: DownloadPayload): string {
  return createHmac("sha256", signingKey())
    .update(`${payload.jobId}:${payload.userId}:${payload.expiresAt}`)
    .digest("base64url");
}

/**
 * Comprueba una firma.
 *
 * Devuelve `false` si la firma no corresponde, si ha caducado o si el
 * trabajo o la persona no son los esperados.
 */
export function verifyDownload(
  signature: string,
  payload: DownloadPayload,
  now: number = Date.now(),
): boolean {
  if (!signature || payload.expiresAt <= now) {
    return false;
  }

  const expected = Buffer.from(signDownload(payload), "utf8");
  const received = Buffer.from(signature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

/** Instante de expiración para una descarga firmada. */
export function downloadExpiry(now: number = Date.now()): number {
  return now + DOWNLOAD_TTL_MINUTES * 60 * 1000;
}
