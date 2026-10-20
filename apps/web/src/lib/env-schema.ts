import { z } from "zod";

/**
 * Esquema de configuración del servidor.
 *
 * Vive en un módulo aparte de `env.ts` porque aquel declara `server-only` y,
 * por tanto, no puede importarse desde una prueba unitaria. Separar el
 * esquema permite verificar el comportamiento del arranque sin levantar la
 * aplicación.
 */

/**
 * Una variable opcional ausente y una variable opcional presente pero vacía
 * significan lo mismo: «no configurada».
 *
 * Los archivos .env de desarrollo entregan valores vacíos (por ejemplo, las
 * tres variables de Cloudinary de .env.example). Si se rechazaran, la
 * aplicación no arrancaría con su propio archivo de ejemplo.
 */
export const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Envuelve un esquema opcional para tratar la cadena vacía como ausente. */
export const optionalEnv = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(emptyToUndefined, schema);

const optionalNonEmpty = optionalEnv(z.string().trim().min(1).optional());

const databaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL es obligatoria.")
  .refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL debe ser una URL de PostgreSQL.",
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: optionalEnv(z.string().url("APP_URL debe ser una URL absoluta.").optional()),
  DATABASE_URL: databaseUrlSchema,
  DIRECT_URL: optionalNonEmpty,
  SETUP_TOKEN: optionalEnv(z.string().min(32).max(256).optional()),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  RATE_LIMIT_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).max(1000).optional(),
  RATE_LIMIT_LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).optional(),
  CLOUDINARY_CLOUD_NAME: optionalNonEmpty,
  CLOUDINARY_API_KEY: optionalNonEmpty,
  CLOUDINARY_API_SECRET: optionalNonEmpty,
  CLOUDINARY_UPLOAD_FOLDER: optionalEnv(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9/_-]{2,120}$/u, "La carpeta de Cloudinary no es válida.")
      .default("escribiendo"),
  ),
  EXPORT_SIGNING_SECRET: optionalEnv(z.string().min(32).max(256).optional()),
});

export type ServerEnv = z.infer<typeof envSchema>;

/**
 * Comprueba que la configuración de Cloudinary esté completa o ausente.
 *
 * Devuelve `null` cuando Cloudinary no está configurado (opción válida en
 * Fase 1) y lanza un error cuando está configurado a medias, porque firmar
 * con credenciales incompletas produciría peticiones rechazadas sin
 * explicación.
 */
export function resolveCloudinaryConfig(
  env: Pick<
    ServerEnv,
    | "CLOUDINARY_CLOUD_NAME"
    | "CLOUDINARY_API_KEY"
    | "CLOUDINARY_API_SECRET"
    | "CLOUDINARY_UPLOAD_FOLDER"
  >,
): { cloudName: string; apiKey: string; apiSecret: string; uploadFolder: string } | null {
  const values = [env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET];
  const configuredCount = values.filter(Boolean).length;

  if (configuredCount === 0) {
    return null;
  }

  if (configuredCount !== values.length) {
    throw new Error("La configuración de Cloudinary está incompleta.");
  }

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: env.CLOUDINARY_API_KEY as string,
    apiSecret: env.CLOUDINARY_API_SECRET as string,
    uploadFolder: env.CLOUDINARY_UPLOAD_FOLDER,
  };
}
