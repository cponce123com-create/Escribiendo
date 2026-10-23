import "server-only";
import type { Prisma } from "@escribiendo/database";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import type { CharacterRoleValue, PlanKind, PlanStatus, WorldKindValue } from "./labels";
import { storyIdSchema } from "./validation";

/**
 * Consultas de las herramientas de historia.
 *
 * Todas filtran por el espacio de trabajo de la sesión y por `deletedAt`:
 * una entrada de otro estudio no se puede leer aunque se conozca su
 * identificador.
 */

export interface StoryBookOption {
  id: string;
  title: string;
}

export interface PlanItemView {
  id: string;
  title: string;
  summary: string | null;
  kind: PlanKind;
  status: PlanStatus;
  bookId: string | null;
  bookTitle: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterView {
  id: string;
  name: string;
  role: CharacterRoleValue;
  age: string | null;
  occupation: string | null;
  summary: string | null;
  description: string | null;
  personality: string | null;
  motivation: string | null;
  conflict: string | null;
  arc: string | null;
  notes: string | null;
  bookId: string | null;
  bookTitle: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorldView {
  id: string;
  name: string;
  kind: WorldKindValue;
  summary: string | null;
  description: string | null;
  rules: string | null;
  notes: string | null;
  bookId: string | null;
  bookTitle: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryFilters {
  bookId?: string;
  search?: string;
}

/** Libros del estudio para los selectores de las herramientas. */
export async function listStoryBooks(session: SessionContext): Promise<StoryBookOption[]> {
  return prisma.book.findMany({
    where: { workspaceId: session.workspace.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
}

/**
 * Resuelve el libro de un filtro. Si el identificador no es válido o el libro
 * no pertenece al estudio, se devuelve `null` y la página muestra todo.
 */
export async function getStoryBookOption(
  session: SessionContext,
  value: string | undefined,
): Promise<StoryBookOption | null> {
  if (!value) {
    return null;
  }

  const parsed = storyIdSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  return prisma.book.findFirst({
    where: {
      id: parsed.data,
      workspaceId: session.workspace.id,
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
}

export async function listPlanItems(
  session: SessionContext,
  filters: StoryFilters,
): Promise<PlanItemView[]> {
  const search = filters.search?.trim();
  const where: Prisma.StoryPlanItemWhereInput = {
    workspaceId: session.workspace.id,
    deletedAt: null,
    ...(filters.bookId ? { bookId: filters.bookId } : {}),
  };

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.storyPlanItem.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      kind: true,
      status: true,
      bookId: true,
      createdAt: true,
      updatedAt: true,
      book: { select: { title: true } },
      createdBy: { select: { name: true } },
    },
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    kind: item.kind,
    status: item.status,
    bookId: item.bookId,
    bookTitle: item.book?.title ?? null,
    createdByName: item.createdBy?.name ?? "Sistema",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export async function listCharacters(
  session: SessionContext,
  filters: StoryFilters & { role?: CharacterRoleValue },
): Promise<CharacterView[]> {
  const search = filters.search?.trim();
  const where: Prisma.StoryCharacterWhereInput = {
    workspaceId: session.workspace.id,
    deletedAt: null,
    ...(filters.bookId ? { bookId: filters.bookId } : {}),
    ...(filters.role ? { role: filters.role } : {}),
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { occupation: { contains: search, mode: "insensitive" } },
    ];
  }

  const characters = await prisma.storyCharacter.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      age: true,
      occupation: true,
      summary: true,
      description: true,
      personality: true,
      motivation: true,
      conflict: true,
      arc: true,
      notes: true,
      bookId: true,
      createdAt: true,
      updatedAt: true,
      book: { select: { title: true } },
      createdBy: { select: { name: true } },
    },
  });

  return characters.map(({ book, createdBy, ...character }) => ({
    ...character,
    bookTitle: book?.title ?? null,
    createdByName: createdBy?.name ?? "Sistema",
  }));
}

export async function listWorlds(
  session: SessionContext,
  filters: StoryFilters & { kind?: WorldKindValue },
): Promise<WorldView[]> {
  const search = filters.search?.trim();
  const where: Prisma.StoryWorldWhereInput = {
    workspaceId: session.workspace.id,
    deletedAt: null,
    ...(filters.bookId ? { bookId: filters.bookId } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const worlds = await prisma.storyWorld.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      summary: true,
      description: true,
      rules: true,
      notes: true,
      bookId: true,
      createdAt: true,
      updatedAt: true,
      book: { select: { title: true } },
      createdBy: { select: { name: true } },
    },
  });

  return worlds.map(({ book, createdBy, ...world }) => ({
    ...world,
    bookTitle: book?.title ?? null,
    createdByName: createdBy?.name ?? "Sistema",
  }));
}
