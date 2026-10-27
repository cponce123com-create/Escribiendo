import { describe, expect, it } from "vitest";
import { envSchema, resolveCloudinaryConfig } from "./env-schema";

const baseEnv = {
  DATABASE_URL: "postgresql://usuario:clave@host.neon.tech/neondb?sslmode=require",
};

describe("envSchema", () => {
  it("valida el número de proxies de confianza", () => {
    expect(envSchema.parse(baseEnv).TRUSTED_PROXY_HOPS).toBe(1);
    expect(envSchema.parse({ ...baseEnv, TRUSTED_PROXY_HOPS: "0" }).TRUSTED_PROXY_HOPS).toBe(0);
    for (const value of ["-1", "1.5", "basura"]) {
      expect(envSchema.safeParse({ ...baseEnv, TRUSTED_PROXY_HOPS: value }).success).toBe(false);
    }
  });
  it("acepta los valores vacíos que entrega .env.example", () => {
    const parsed = envSchema.safeParse({
      ...baseEnv,
      APP_URL: "",
      DIRECT_URL: "",
      SETUP_TOKEN: "",
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      CLOUDINARY_UPLOAD_FOLDER: "",
    });

    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      return;
    }

    expect(parsed.data.APP_URL).toBeUndefined();
    expect(parsed.data.DIRECT_URL).toBeUndefined();
    expect(parsed.data.SETUP_TOKEN).toBeUndefined();
    expect(parsed.data.CLOUDINARY_CLOUD_NAME).toBeUndefined();
    expect(parsed.data.CLOUDINARY_API_KEY).toBeUndefined();
    expect(parsed.data.CLOUDINARY_API_SECRET).toBeUndefined();
    expect(parsed.data.CLOUDINARY_UPLOAD_FOLDER).toBe("escribiendo");
  });

  it("rechaza una DATABASE_URL ausente o que no sea de PostgreSQL", () => {
    expect(envSchema.safeParse({}).success).toBe(false);
    expect(envSchema.safeParse({ ...baseEnv, DATABASE_URL: "mysql://host/db" }).success).toBe(
      false,
    );
  });

  it("rechaza un SETUP_TOKEN demasiado corto", () => {
    expect(envSchema.safeParse({ ...baseEnv, SETUP_TOKEN: "corto" }).success).toBe(false);
    expect(envSchema.safeParse({ ...baseEnv, SETUP_TOKEN: "a".repeat(32) }).success).toBe(true);
  });

  it("aplica los valores por defecto de SESSION_TTL_DAYS y LOG_LEVEL", () => {
    const parsed = envSchema.safeParse(baseEnv);

    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      return;
    }

    expect(parsed.data.SESSION_TTL_DAYS).toBe(14);
    expect(parsed.data.NODE_ENV).toBe("development");
    expect(parsed.data.LOG_LEVEL).toBeUndefined();
  });

  it("rechaza un APP_URL que no sea una URL absoluta", () => {
    expect(envSchema.safeParse({ ...baseEnv, APP_URL: "no-es-una-url" }).success).toBe(false);
  });
});

describe("resolveCloudinaryConfig", () => {
  const base = {
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
    CLOUDINARY_UPLOAD_FOLDER: "escribiendo",
  };

  it("devuelve null cuando Cloudinary no está configurado", () => {
    expect(resolveCloudinaryConfig(base)).toBeNull();
  });

  it("devuelve la configuración cuando están las tres variables", () => {
    expect(
      resolveCloudinaryConfig({
        ...base,
        CLOUDINARY_CLOUD_NAME: "demo",
        CLOUDINARY_API_KEY: "1234",
        CLOUDINARY_API_SECRET: "secreto",
      }),
    ).toEqual({
      cloudName: "demo",
      apiKey: "1234",
      apiSecret: "secreto",
      uploadFolder: "escribiendo",
    });
  });

  it("lanza un error cuando la configuración está a medias", () => {
    expect(() =>
      resolveCloudinaryConfig({
        ...base,
        CLOUDINARY_CLOUD_NAME: "demo",
        CLOUDINARY_API_KEY: "1234",
      }),
    ).toThrow(/incompleta/u);
  });
});
