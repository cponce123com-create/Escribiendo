/**
 * Elimina credenciales de un texto antes de escribirlo en un registro.
 *
 * Los mensajes de error de los controladores de base de datos pueden incluir
 * la cadena de conexión completa, con usuario y contraseña. Esos mensajes se
 * registran para diagnosticar fallos, pero nunca deben filtrar un secreto.
 */

const URL_WITH_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]*)@/giu;
const TOKEN_LIKE = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/gu;

/** Sustituye usuario, contraseña y tokens por un marcador. */
export function scrubSecrets(value: string): string {
  return value.replace(URL_WITH_CREDENTIALS, "$1$2:[redacted]@").replace(TOKEN_LIKE, "[redacted]");
}
