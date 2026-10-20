const MIN_IDENTITY_LENGTH = 4;

export function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation;
}

/**
 * Normaliza un valor para compararlo sin separadores ni acentos.
 *
 * Sin esto, una contraseña como «Ana-Ruiz-Clave-2026» esquivaba el filtro
 * de identidad, porque el nombre «Ana Ruiz» se comparaba con su espacio
 * literal.
 */
function normalizeIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/gu, "");
}

/**
 * Evita que la contraseña contenga el nombre o la parte local del correo.
 * Se comparan en minúsculas, sin acentos y sin separadores.
 */
export function passwordContainsIdentity(password: string, email: string, name: string): boolean {
  const normalizedPassword = normalizeIdentity(password);
  const emailLocalPart = normalizeIdentity(email.split("@")[0] ?? "");
  const normalizedName = normalizeIdentity(name);

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
