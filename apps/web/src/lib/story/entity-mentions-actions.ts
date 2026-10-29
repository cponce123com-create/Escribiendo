"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { assertServerActionOrigin } from "@/lib/security/request-context";
import { storyBookExists } from "./action-helpers";
import {
  detectEntityMentions,
  type EntityMentionProposal,
  type MentionEntity,
} from "./entity-mentions";
// El aplanado vive en un módulo compartido; se conserva el nombre local para
// que las llamadas de este archivo sigan leyéndose igual.
import { tipTapToPlainText as flatten } from "./tiptap-text";

/**
 * Cobertura de menciones de la biblia de la historia.
 *
 * Parte de las fichas ya creadas (personajes y mundos) y busca sus nombres en
 * el manuscrito. Devuelve una propuesta por entidad y la lista de fichas que
 * no aparecen en ningún sitio, que suele ser la información más útil.
 *
 * No escribe nada: es una lectura de apoyo para decidir qué vincular o qué
 * ficha falta por completar.
 */

const MAX_SECTIONS_PER_ENTITY = 8;

export interface MentionSummary {
  entityId: string;
  entityName: string;
  kind: MentionEntity["kind"];
  total: number;
  sectionCount: number;
  sections: Array<{ sectionId: string; sectionTitle: string; count: number; excerpt: string }>;
}

export interface BookMentionsResult {
  ok: true;
  entities: number;
  sections: number;
  mentions: MentionSummary[];
  /** Fichas que no se mencionan en ninguna sección. */
  missing: Array<{ id: string; name: string; kind: MentionEntity["kind"] }>;
  notice: string;
}

export type BookMentionsResponse = BookMentionsResult | { ok: false; error: string };

export async function getBookEntityMentions(bookId: string): Promise<BookMentionsResponse> {
  try {
    await assertServerActionOrigin();
  } catch {
    return { ok: false, error: "No se ha podido validar la solicitud." };
  }

  const session = await getSession();

  if (!session) {
    return { ok: false, error: "Inicia sesión para continuar." };
  }

  if (!(await storyBookExists(session, bookId))) {
    return { ok: false, error: "El libro no existe en este espacio de trabajo." };
  }

  const [characters, worlds, sections] = await Promise.all([
    prisma.storyCharacter.findMany({
      where: { workspaceId: session.workspace.id, bookId, deletedAt: null },
      select: { id: true, name: true, aliases: true },
      orderBy: { name: "asc" },
    }),
    prisma.storyWorld.findMany({
      where: { workspaceId: session.workspace.id, bookId, deletedAt: null },
      select: { id: true, name: true, aliases: true },
      orderBy: { name: "asc" },
    }),
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null, isHidden: false },
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, title: true, content: true },
    }),
  ]);

  const entities: MentionEntity[] = [
    ...characters.map((character) => ({
      id: character.id,
      name: character.name,
      aliases: character.aliases,
      kind: "CHARACTER" as const,
    })),
    ...worlds.map((world) => ({
      id: world.id,
      name: world.name,
      aliases: world.aliases,
      kind: "WORLD" as const,
    })),
  ];

  if (entities.length === 0) {
    return {
      ok: true,
      entities: 0,
      sections: sections.length,
      mentions: [],
      missing: [],
      notice: "Aún no hay personajes ni mundos en este libro.",
    };
  }

  const proposals = detectEntityMentions(
    entities,
    sections.map((section, index) => ({
      id: section.id,
      title: section.title,
      order: index + 1,
      text: flatten(section.content),
    })),
  );

  const mentions: MentionSummary[] = proposals.map((proposal: EntityMentionProposal) => ({
    entityId: proposal.entityId,
    entityName: proposal.entityName,
    kind: proposal.kind,
    total: proposal.total,
    sectionCount: proposal.sections.length,
    sections: proposal.sections.slice(0, MAX_SECTIONS_PER_ENTITY).map((hit) => ({
      sectionId: hit.sectionId,
      sectionTitle: hit.sectionTitle,
      count: hit.count,
      excerpt: hit.excerpt,
    })),
  }));

  const mentioned = new Set(proposals.map((proposal) => proposal.entityId));

  return {
    ok: true,
    entities: entities.length,
    sections: sections.length,
    mentions,
    missing: entities
      .filter((entity) => !mentioned.has(entity.id))
      .map((entity) => ({ id: entity.id, name: entity.name, kind: entity.kind })),
    notice:
      "Coincidencias por nombre y alias, sin distinguir mayúsculas ni tildes. Las variantes que no estén en la ficha no se detectan.",
  };
}
