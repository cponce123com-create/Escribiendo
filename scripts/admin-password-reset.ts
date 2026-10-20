/**
 * Emite un enlace de recuperación de contraseña de un solo uso.
 *
 * La plataforma no envía correo electrónico en la Fase 1 (no hay proveedor
 * contratado). El administrador ejecuta este script en un equipo de confianza
 * y entrega el enlace por un canal privado.
 *
 * Uso:
 *   pnpm admin:password-reset -- correo@ejemplo.com
 *   pnpm admin:password-reset -- correo@ejemplo.com --revoke-sessions
 *   pnpm admin:password-reset -- correo@ejemplo.com --ttl-minutes=30
 *
 * Requiere DATABASE_URL o DIRECT_URL en el entorno o en el .env de la raíz.
 * El token original se imprime una sola vez; en PostgreSQL solo queda su hash.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const DEFAULT_TTL_MINUTES = 60;
const MIN_TTL_MINUTES = 15;
const MAX_TTL_MINUTES = 24 * 60;

interface ParsedArguments {
  email: string;
  ttlMinutes: number;
  revokeSessions: boolean;
  help: boolean;
}

function parseArguments(argv: string[]): ParsedArguments {
  const flags = argv.filter((argument) => argument.startsWith("--"));
  const positional = argv.filter((argument) => !argument.startsWith("--"));
  const ttlFlag = flags.find((flag) => flag.startsWith("--ttl-minutes="));
  const ttlValue = ttlFlag ? Number.parseInt(ttlFlag.split("=")[1] ?? "", 10) : DEFAULT_TTL_MINUTES;

  return {
    email: (positional[0] ?? "").trim().toLowerCase(),
    ttlMinutes: Number.isFinite(ttlValue) ? ttlValue : DEFAULT_TTL_MINUTES,
    revokeSessions: flags.includes("--revoke-sessions"),
    help: flags.includes("--help") || flags.includes("-h"),
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      "Uso: pnpm admin:password-reset -- <correo> [opciones]",
      "",
      "Opciones:",
      `  --ttl-minutes=<n>   Validez del enlace (${MIN_TTL_MINUTES}-${MAX_TTL_MINUTES}; por defecto ${DEFAULT_TTL_MINUTES}).`,
      "  --revoke-sessions   Cierra todas las sesiones activas del usuario.",
      "  --help              Muestra esta ayuda.",
      "",
      "Variables de entorno: DATABASE_URL (o DIRECT_URL) y APP_URL.",
    ].join("\n"),
  );
}

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.email) {
    printHelp();
    fail("Falta el correo electrónico del usuario.");
  }

  if (args.ttlMinutes < MIN_TTL_MINUTES || args.ttlMinutes > MAX_TTL_MINUTES) {
    fail(`La validez debe estar entre ${MIN_TTL_MINUTES} y ${MAX_TTL_MINUTES} minutos.`);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(args.email)) {
    fail("El correo electrónico no tiene un formato válido.");
  }

  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    fail("Define DATABASE_URL o DIRECT_URL antes de ejecutar este script.");
  }

  // Las importaciones son dinámicas para que dotenv se cargue antes de que
  // Prisma Client lea la configuración del entorno.
  const { prisma } = await import("../packages/database/src/client");
  const { generateToken, hashToken } = await import("../apps/web/src/lib/auth/tokens");

  try {
    const user = await prisma.user.findUnique({
      where: { email: args.email },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      fail("No existe ninguna cuenta activa con ese correo electrónico.");
    }

    if (!user.isActive) {
      fail("La cuenta está desactivada. Reactívala antes de emitir un enlace.");
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + args.ttlMinutes * 60 * 1_000);
    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      // Un enlace nuevo invalida los anteriores para reducir el riesgo de
      // reutilización si algún mensaje antiguo sigue accesible.
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });

      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      if (args.revokeSessions) {
        await transaction.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: "AUTH_PASSWORD_RESET_ISSUED_CLI",
          entityType: "User",
          entityId: user.id,
          metadata: {
            expiresAt: expiresAt.toISOString(),
            revokedSessions: args.revokeSessions,
          },
        },
      });
    });

    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/u, "");
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

    process.stdout.write(
      [
        "",
        `Enlace de recuperación para ${user.name} <${user.email}>:`,
        "",
        resetUrl,
        "",
        `Caduca: ${expiresAt.toISOString()} (${args.ttlMinutes} minutos).`,
        "El enlace solo se muestra esta vez. No lo guardes en el repositorio.",
        "",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Fallo desconocido.";
  process.stderr.write(`Error inesperado: ${message}\n`);
  process.exit(1);
});
