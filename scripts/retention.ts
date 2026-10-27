/**
 * Aplica la política de retención de datos.
 *
 * La plataforma guarda lo justo para funcionar: los datos que caducan se
 * borran, y lo que se conserva (manuscritos, revisiones, auditoría) se
 * conserva mientras el estudio exista.
 *
 * Esta rutina borra únicamente lo que ya no puede usarse:
 *
 * - Sesiones caducadas o revocadas (hace más de 30 días).
 * - Tokens de recuperación de contraseña caducados o usados.
 * - Invitaciones caducadas, revocadas o aceptadas (hace más de 30 días).
 *
 * No toca manuscritos, revisiones, notas, comentarios ni auditoría: esos
 * datos son del estudio y su borrado es una decisión de quien lo dirige,
 * no una tarea de mantenimiento.
 *
 * Uso:
 *   pnpm retention:clean            # informa y borra
 *   pnpm retention:clean --dry-run  # solo informa
 *
 * Requiere DATABASE_URL o DIRECT_URL en el entorno o en el .env de la raíz.
 */
import path from "node:path";
import { sessionRetentionWhere, SESSION_RETENTION_DAYS } from "./lib/retention-policy";
import { config as loadEnv } from "dotenv";
import { prisma } from "../packages/database/src/client";

loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

/** Días que se conserva una invitación resuelta antes de borrarla. */
const INVITATION_RETENTION_DAYS = 30;

function informar(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const ahora = new Date();
  const filtroSesiones = sessionRetentionWhere(ahora);
  const limiteInvitaciones = new Date(
    ahora.getTime() - INVITATION_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );

  const sesiones = await prisma.session.count({
    where: filtroSesiones,
  });
  const tokens = await prisma.passwordResetToken.count({
    where: { OR: [{ expiresAt: { lt: ahora } }, { usedAt: { not: null } }] },
  });
  const invitaciones = await prisma.workspaceInvitation.count({
    where: {
      OR: [
        { expiresAt: { lt: ahora } },
        { revokedAt: { not: null }, updatedAt: { lt: limiteInvitaciones } },
        { acceptedAt: { not: null }, updatedAt: { lt: limiteInvitaciones } },
      ],
    },
  });

  informar("Retención de datos");
  informar(
    `  sesiones caducadas o revocadas hace más de ${SESSION_RETENTION_DAYS} días: ${sesiones}`,
  );
  informar(`  tokens de recuperación caducados o usados: ${tokens}`);
  informar(
    `  invitaciones caducadas, revocadas o aceptadas (más de ${INVITATION_RETENTION_DAYS} días): ${invitaciones}`,
  );

  if (dryRun) {
    informar("\nDry run: no se borra nada.");
    return;
  }

  if (sesiones + tokens + invitaciones === 0) {
    informar("\nNo hay nada que borrar.");
    return;
  }

  const [sesionesBorradas, tokensBorrados, invitacionesBorradas] = await prisma.$transaction([
    prisma.session.deleteMany({ where: filtroSesiones }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: ahora } }, { usedAt: { not: null } }] },
    }),
    prisma.workspaceInvitation.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: ahora } },
          { revokedAt: { not: null }, updatedAt: { lt: limiteInvitaciones } },
          { acceptedAt: { not: null }, updatedAt: { lt: limiteInvitaciones } },
        ],
      },
    }),
  ]);

  informar(
    `\nBorrados: ${sesionesBorradas.count} sesiones, ${tokensBorrados.count} tokens, ${invitacionesBorradas.count} invitaciones.`,
  );
  informar(
    "No se ha tocado ningún manuscrito, revisión, nota, comentario ni registro de auditoría.",
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `No se ha podido aplicar la retención (${error instanceof Error ? error.name : "error desconocido"}).\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
