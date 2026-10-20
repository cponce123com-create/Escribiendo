import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, personNameSchema, zodFieldErrors } from "./validation";

describe("emailSchema", () => {
  it("normaliza el correo a minúsculas", () => {
    expect(emailSchema.parse("  Autora@Ejemplo.COM ")).toBe("autora@ejemplo.com");
  });

  it("rechaza correos inválidos", () => {
    expect(emailSchema.safeParse("no-es-un-correo").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("acepta una frase de acceso larga", () => {
    expect(passwordSchema.safeParse("Una frase larga y memorable 2026").success).toBe(true);
  });

  it("rechaza contraseñas cortas", () => {
    expect(passwordSchema.safeParse("corta").success).toBe(false);
  });

  it("rechaza contraseñas comunes", () => {
    expect(passwordSchema.safeParse("password1234").success).toBe(false);
  });
});

describe("personNameSchema", () => {
  it("elimina espacios exteriores", () => {
    expect(personNameSchema.parse("  Ada Lovelace  ")).toBe("Ada Lovelace");
  });

  it("rechaza nombres de un carácter", () => {
    expect(personNameSchema.safeParse("A").success).toBe(false);
  });
});

describe("zodFieldErrors", () => {
  it("agrupa el primer mensaje por campo", () => {
    const result = personNameSchema.safeParse("");
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(zodFieldErrors(result.error)).toHaveProperty("form");
    }
  });
});
