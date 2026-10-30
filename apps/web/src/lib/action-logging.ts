import { logger } from "@/lib/logger";
import type { RequestContext } from "@/lib/security/request-context";

/** Registra solo metadatos seguros de una Server Action, nunca el mensaje del error. */
export function logActionError(
  event: string,
  context: RequestContext | undefined,
  error: unknown,
): void {
  logger.error(event, {
    requestId: context?.requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}
