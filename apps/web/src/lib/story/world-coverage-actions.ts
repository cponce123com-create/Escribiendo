"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { storyBookExists } from "./action-helpers";
import { tipTapToPlainText } from "./tiptap-text";
import { buildWorldCoverage, type WorldCoverageReport } from "./world-coverage";

/**
 * Cobertura de los mundos de un libro.
 *
 * Complementa el mapa de menciones: allí se pregunta dónde aparece cada ficha;
 * aquí, qué lugar entra tarde, desaparece o no llega a mencionarse nunca. No
 * escribe nada: el vínculo con el manuscrito se deriva del texto.
 */
export type WorldCoverageResponse =
  ({ ok: true } & WorldCoverageReport) | { ok: false; error: string };

export async function getBookWorldCoverage(bookId: string): Promise<WorldCoverageResponse> {
  const session = await getSession();

  if (!session) {
    return { ok: false, error: "Inicia sesión para continuar." };
  }

  if (!(await storyBookExists(session, bookId))) {
    return { ok: false, error: "El libro no existe en este espacio de trabajo." };
  }

  const [worlds, sections] = await Promise.all([
    prisma.storyWorld.findMany({
      where: { workspaceId: session.workspace.id, bookId, deletedAt: null },
      select: { id: true, name: true, aliases: true, kind: true },
      orderBy: { name: "asc" },
    }),
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, title: true, content: true },
    }),
  ]);

  return {
    ok: true,
    ...buildWorldCoverage(
      worlds.map((world) => ({
        id: world.id,
        name: world.name,
        aliases: world.aliases,
        kind: "WORLD" as const,
      })),
      sections.map((section, index) => ({
        id: section.id,
        title: section.title,
        order: index + 1,
        text: tipTapToPlainText(section.content),
      })),
    ),
  };
}
