import "server-only";
import { envSchema, resolveCloudinaryConfig, type ServerEnv } from "./env-schema";

export type { ServerEnv } from "./env-schema";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadFolder: string;
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(
      ", ",
    );
    throw new Error(
      `Configuración del servidor incompleta. Revisa: ${fields || "variables de entorno"}.`,
    );
  }

  if (parsed.data.NODE_ENV === "production" && !parsed.data.APP_URL) {
    throw new Error("Configuración del servidor incompleta. Revisa: APP_URL.");
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getCloudinaryConfig(): CloudinaryConfig | null {
  return resolveCloudinaryConfig(getServerEnv());
}

export function getAppUrl(): string {
  const env = getServerEnv();

  if (env.APP_URL) {
    return env.APP_URL.replace(/\/+$/u, "");
  }

  return "http://localhost:3000";
}

export function isSetupTokenConfigured(): boolean {
  return Boolean(getServerEnv().SETUP_TOKEN);
}

export function getSessionTtlMs(): number {
  return getServerEnv().SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
