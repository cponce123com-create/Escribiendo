import { describe, expect, it } from "vitest";
import { scrubSecrets } from "./redaction";

describe("scrubSecrets", () => {
  it("oculta la contraseña de una URL de PostgreSQL", () => {
    const result = scrubSecrets(
      "Invalid invocation: Can't reach database server at `postgresql://usuario:claveSecreta@ep-x.region.neon.tech/neondb`",
    );

    expect(result).not.toContain("claveSecreta");
    expect(result).toContain("usuario:[redacted]@");
  });

  it("oculta la contraseña aunque la URL no tenga esquema", () => {
    const result = scrubSecrets("postgres://admin:s3cr3t@host:5432/db");

    expect(result).not.toContain("s3cr3t");
  });

  it("deja intactas las URLs sin credenciales", () => {
    const result = scrubSecrets("conectado a postgresql://127.0.0.1:5433/escribiendo");

    expect(result).toBe("conectado a postgresql://127.0.0.1:5433/escribiendo");
  });

  it("oculta tokens con formato de GitHub", () => {
    const result = scrubSecrets("token gho_abcdefghijklmnopqrstuvwxyz012345 reutilizado");

    expect(result).not.toContain("gho_abcdefghijklmnopqrstuvwxyz012345");
    expect(result).toContain("[redacted]");
  });

  it("no modifica un texto sin secretos", () => {
    const message = "The table `public.users` does not exist in the current database.";

    expect(scrubSecrets(message)).toBe(message);
  });
});
