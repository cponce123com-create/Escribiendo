import "server-only";
import type { Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { RequestContext } from "@/lib/security/request-context";

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * La auditoría nunca debe contener contraseñas, tokens, contenido de
 * manuscritos ni cuerpos completos de solicitudes.
 */
export async function writeAuditLog(
  input: AuditInput,
  requestContext?: RequestContext,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        workspaceId: input.workspaceId ?? null,
        actorId: input.actorId ?? null,
        requestId: input.requestId ?? requestContext?.requestId ?? null,
        ipHash: input.ipHash ?? requestContext?.ipHash ?? null,
        metadata: input.metadata ?? {},
      },
    });
  } catch (error) {
    logger.error("audit.write_failed", {
      action: input.action,
      requestId: input.requestId ?? requestContext?.requestId,
      error,
    });
  }
}
