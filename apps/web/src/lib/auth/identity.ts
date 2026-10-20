const MIN_IDENTITY_LENGTH = 4;

export function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation;
}

/**
 * Evita que la contraseña contenga el nombre o la parte local del correo.
 * Se comparan en minúsculas y con la configuración regional española.
 */
export function passwordContainsIdentity(password: string, email: string, name: string): boolean {
  const normalizedPassword = password.toLocaleLowerCase("es");
  const emailLocalPart = email.split("@")[0] ?? "";
  const normalizedName = name.trim().toLocaleLowerCase("es");

  return (
    (emailLocalPart.length >= MIN_IDENTITY_LENGTH && normalizedPassword.includes(emailLocalPart)) ||
    (normalizedName.length >= MIN_IDENTITY_LENGTH && normalizedPassword.includes(normalizedName))
  );
}

/**
 * Genera una base estable para el slug del espacio de trabajo. La unicidad la
 * garantiza la base de datos; el llamador añade un sufijo aleatorio.
 */
export function slugifyWorkspaceName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);

  return base || "estudio";
}
