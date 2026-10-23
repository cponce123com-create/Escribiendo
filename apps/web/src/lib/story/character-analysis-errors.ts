const MIGRATION_MESSAGE =
  "El análisis de personajes necesita una migración pendiente. En el servidor, ejecuta `pnpm db:migrate` y vuelve a cargar esta página.";

/** Convierte fallos de esquema en una instrucción útil sin exponer el error de Prisma. */
export function characterAnalysisError(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "No se pudo completar el análisis de personajes. Inténtalo de nuevo.";
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const code = candidate.code;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (
    code === "P2021" ||
    code === "P2022" ||
    message.includes("does not exist") ||
    message.includes("Unknown column")
  ) {
    return MIGRATION_MESSAGE;
  }

  return "No se pudo completar el análisis de personajes. Inténtalo de nuevo.";
}
