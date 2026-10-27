import type { Instrumentation } from "next";
import { scrubSecrets } from "@escribiendo/shared";

/**
 * Extrae el código de error de Prisma (P2021, P1001…) u otros códigos de
 * Error. Sin él, los registros solo indicaban el nombre de la clase y no
 * permitían saber si faltaban migraciones o la base de datos estaba caída.
 */
function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as { code?: unknown; errorCode?: unknown };

  if (typeof candidate.code === "string") {
    return candidate.code;
  }

  if (typeof candidate.errorCode === "string") {
    return candidate.errorCode;
  }

  return undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.message === "string" && error.message.length > 0) {
    return scrubSecrets(error.message).slice(0, 500);
  }

  return undefined;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // La instrumentación puede compilarse para Edge, donde process.stdout no
  // existe. El logger estructurado solo se carga en el runtime Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { logger } = await import("@/lib/logger");

  logger.error("http.request_error", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode: readErrorCode(error),
    errorMessage: readErrorMessage(error),
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getServerEnv } = await import("@/lib/env");
  getServerEnv(); // Valida las claves obligatorias antes de aceptar solicitudes.
  const { warnIfMultipleProcesses } = await import("@/lib/security/rate-limit");
  warnIfMultipleProcesses(process.env.WEB_CONCURRENCY);
}
