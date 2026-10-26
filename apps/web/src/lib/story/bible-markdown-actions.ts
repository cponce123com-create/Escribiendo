"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { storyBookExists } from "./action-helpers";
import { buildStoryBibleMarkdown } from "./bible-markdown";
import { detectEntityMentions, type MentionEntity } from "./entity-mentions";
import {
  CHARACTER_RELATION_LABELS,
  CHARACTER_ROLE_LABELS,
  PLAN_KIND_LABELS,
  PLAN_STATUS_LABELS,
  WORLD_KIND_LABELS,
} from "./labels";
import { tipTapToPlainText } from "./tiptap-text";

/**
 * Biblia de la historia en Markdown.
 *
 * Devuelve el texto y el nombre del archivo; el navegador lo descarga. No crea
 * un trabajo de exportación: la biblia no es un artefacto de edición y no
 * necesita firma, almacenamiento ni retención.
 */
export type BibleExportResponse =
  { ok: true; filename: string; content: string } | { ok: false; error: string };

function fileSlug(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug.length > 0 ? slug : "biblia";
}

export async function exportStoryBibleMarkdown(bookId: string): Promise<BibleExportResponse> {
  const session = await getSession();

  if (!session) {
    return { ok: false, error: "Inicia sesión para continuar." };
  }

  if (!(await storyBookExists(session, bookId))) {
    return { ok: false, error: "El libro no existe en este espacio de trabajo." };
  }

  const workspaceId = session.workspace.id;

  const [book, characters, worlds, relations, planItems, sections] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId }, select: { title: true } }),
    prisma.storyCharacter.findMany({
      where: { workspaceId, bookId, deletedAt: null },
      select: { id: true, name: true, aliases: true, role: true, summary: true },
      orderBy: { name: "asc" },
    }),
    prisma.storyWorld.findMany({
      where: { workspaceId, bookId, deletedAt: null },
      select: { id: true, name: true, aliases: true, kind: true, summary: true },
      orderBy: { name: "asc" },
    }),
    prisma.storyCharacterRelation.findMany({
      where: { workspaceId, bookId },
      select: {
        kind: true,
        description: true,
        source: { select: { name: true } },
        target: { select: { name: true } },
      },
    }),
    prisma.storyPlanItem.findMany({
      where: { workspaceId, bookId, deletedAt: null },
      select: { title: true, kind: true, status: true, summary: true },
      orderBy: { createdAt: "asc" },
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

  const mentioned = new Set(
    detectEntityMentions(
      entities,
      sections.map((section, index) => ({
        id: section.id,
        title: section.title,
        order: index + 1,
        text: tipTapToPlainText(section.content),
      })),
    ).map((proposal) => proposal.entityId),
  );

  const content = buildStoryBibleMarkdown({
    bookTitle: book?.title ?? "Libro",
    characters: characters.map((character) => ({
      name: character.name,
      aliases: character.aliases,
      labelTitle: "Papel",
      label: CHARACTER_ROLE_LABELS[character.role],
      summary: character.summary,
    })),
    worlds: worlds.map((world) => ({
      name: world.name,
      aliases: world.aliases,
      labelTitle: "Tipo",
      label: WORLD_KIND_LABELS[world.kind],
      summary: world.summary,
    })),
    planItems: planItems.map((item) => ({
      title: item.title,
      kindLabel: PLAN_KIND_LABELS[item.kind],
      statusLabel: PLAN_STATUS_LABELS[item.status],
      summary: item.summary,
    })),
    relations: relations.map((relation) => ({
      from: relation.source.name,
      to: relation.target.name,
      label: CHARACTER_RELATION_LABELS[relation.kind],
      description: relation.description,
    })),
    missing: entities.filter((entity) => !mentioned.has(entity.id)).map((entity) => entity.name),
  });

  return {
    ok: true,
    filename: `${fileSlug(book?.title ?? "libro")}-biblia.md`,
    content,
  };
}
