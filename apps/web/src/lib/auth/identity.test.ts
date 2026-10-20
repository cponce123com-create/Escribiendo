import { describe, expect, it } from "vitest";
import { passwordContainsIdentity, passwordsMatch, slugifyWorkspaceName } from "./identity";

describe("identity", () => {
  it("detecta el nombre y la parte local del correo en la contraseña", () => {
    expect(passwordContainsIdentity("clara-segura-2026", "clara@ejemplo.com", "Clara")).toBe(true);
    expect(passwordContainsIdentity("mi-clave-2026", "clara@ejemplo.com", "Clara")).toBe(false);
  });

  it("no bloquea identidades demasiado cortas", () => {
    expect(passwordContainsIdentity("ana-2026-segura", "ana@ejemplo.com", "Ana")).toBe(false);
  });

  it("detecta el nombre aunque la contraseña use otros separadores", () => {
    expect(passwordContainsIdentity("Ana-Ruiz-Clave-2026", "correo@ejemplo.com", "Ana Ruiz")).toBe(
      true,
    );
    expect(passwordContainsIdentity("ANARUIZclave2026", "correo@ejemplo.com", "Ana Ruiz")).toBe(
      true,
    );
    expect(passwordContainsIdentity("ana ruiz clave 2026", "correo@ejemplo.com", "Ana Ruiz")).toBe(
      true,
    );
  });

  it("detecta el nombre con acentos en cualquiera de los dos lados", () => {
    expect(passwordContainsIdentity("Jose-2026-segura", "correo@ejemplo.com", "José")).toBe(true);
    expect(passwordContainsIdentity("jose-2026-segura", "correo@ejemplo.com", "José")).toBe(true);
  });

  it("sigue permitiendo contraseñas que no contienen la identidad", () => {
    expect(passwordContainsIdentity("c Omnibus-2026-segura", "correo@ejemplo.com", "Ana")).toBe(
      false,
    );
  });

  it("compara contraseñas sin normalizar", () => {
    expect(passwordsMatch("Clave Segura 2026", "Clave Segura 2026")).toBe(true);
    expect(passwordsMatch("Clave Segura 2026", "clave segura 2026")).toBe(false);
  });

  it("crea slugs sin acentos ni caracteres especiales", () => {
    expect(slugifyWorkspaceName("Taller de Edición Ñandú")).toBe("taller-de-edicion-nandu");
    expect(slugifyWorkspaceName("   ")).toBe("estudio");
  });
});
