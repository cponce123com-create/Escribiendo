import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // La instrumentación puede compilarse para Edge, donde process.stdout no
  // existe. El logger estructurado solo se carga en el runtime Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { logger } = await import("@/lib/logger");

  logger.error("http.request_error", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
