import { describe, expect, it } from "vitest";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "./password";

describe("contraseñas Argon2id", () => {
  it("genera un hash Argon2id verificable", async () => {
    const password = "Una contraseña editorial muy larga";
    const hashed = await hashPassword(password);

    expect(hashed.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(hashed, password)).resolves.toBe(true);
    await expect(verifyPassword(hashed, "otra contraseña")).resolves.toBe(false);
  });

  it("no acepta entradas desmesuradas", async () => {
    const hashed = await hashPassword("Una contraseña editorial muy larga");
    await expect(verifyPassword(hashed, "x".repeat(513))).resolves.toBe(false);
  });

  it("reconoce un hash que necesita actualización", async () => {
    await expect(passwordNeedsRehash("hash-inválido")).resolves.toBe(true);
  });
});
