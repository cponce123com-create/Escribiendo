import { createHash } from "node:crypto";

/**
 * Firma de una miniatura de índice.
 *
 * El resultado de componer el índice depende de los contenidos, la
 * configuración de la edición, la portada y los parámetros. La firma los
 * resume para poder reutilizar una composición idéntica sin volver a paginar
 * el libro.
 *
 * `stable` ordena las claves para que dos objetos equivalentes produzcan la
 * misma firma aunque Prisma los devuelva en otro orden.
 */
function stable(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(stable);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, stable(record[key])]),
    );
  }

  return value;
}

export function tocPreviewCacheKey(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(input)))
    .digest("hex");
}
