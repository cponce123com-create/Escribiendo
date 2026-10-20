import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Un único cliente por proceso. En desarrollo Next.js recarga los módulos con
 * frecuencia; el singleton evita agotar las conexiones de Neon.
 *
 * El tamaño del pool se controla en DATABASE_URL con connection_limit y
 * pool_timeout. En Render Free se recomienda un límite bajo (2–3).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    errorFormat: "minimal",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function checkDatabaseConnection(timeoutMs = 3_000): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const probe = prisma.$queryRaw`SELECT 1`;
    const result = await Promise.race([
      probe.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);

    return result;
  } catch {
    return false;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
