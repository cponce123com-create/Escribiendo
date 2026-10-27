import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const env = vi.hoisted(() => ({
  NODE_ENV: "production",
  EXPORT_SIGNING_SECRET: undefined as string | undefined,
  DATABASE_URL: "postgresql://u:p@localhost/test",
}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));
afterEach(() => {
  vi.resetModules();
  env.NODE_ENV = "production";
  env.EXPORT_SIGNING_SECRET = undefined;
});
const payload = { jobId: "j", userId: "u", expiresAt: 1000 };
it("no deriva claves en producción sin secreto explícito", async () => {
  const { signDownload } = await import("./signature");
  expect(() => signDownload(payload)).toThrow(/EXPORT_SIGNING_SECRET/u);
});
it("solo mantiene el derivado en desarrollo y pruebas", async () => {
  env.NODE_ENV = "test";
  const { signDownload } = await import("./signature");
  expect(signDownload(payload)).toBeTruthy();
});
it("valida firma, identidad y caducidad", async () => {
  env.EXPORT_SIGNING_SECRET = "clave-solo-para-pruebas-".repeat(2);
  const { signDownload, verifyDownload } = await import("./signature");
  const signature = signDownload(payload);
  expect(verifyDownload(signature, payload, 999)).toBe(true);
  expect(verifyDownload(signature, payload, 1000)).toBe(false);
  expect(verifyDownload(signature, { ...payload, userId: "otro" }, 999)).toBe(false);
});
