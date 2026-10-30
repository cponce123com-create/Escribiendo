import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { bookAssetThumbnailUrl } from "@/lib/books/asset-thumbnail";
import { listBookAssets } from "@/lib/books/assets";
import { planOrder, PlanError, MAX_PLAN_ITEMS } from "./structure";
export function manuscriptKey(
  rows: readonly {
    id: string;
    title: string;
    parentId: string | null;
    type: string;
    sortOrder: number;
    version: number;
  }[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...rows]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(({ id, title, parentId, type, sortOrder, version }) => ({
            id,
            title,
            parentId,
            type,
            sortOrder,
            version,
          })),
      ),
    )
    .digest("hex");
}
export async function loadModularPlan(session: SessionContext, bookId: string, trashPage = 1) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, workspaceId: session.workspace.id, deletedAt: null },
    select: { id: true, title: true, narrativeVersion: true },
  });
  if (!book) return null;
  const trashWhere = {
    bookId,
    workspaceId: session.workspace.id,
    deletedAt: { not: null },
    OR: [{ parentId: null }, { parent: { is: { deletedAt: null } } }],
  };
  const requestedPage =
    Number.isSafeInteger(trashPage) && trashPage > 0 ? Math.min(trashPage, 100000) : 1;
  const canManage = canPerform(session.workspace.role, "story:manage");
  const trashTotal = canManage ? await prisma.storyPlanItem.count({ where: trashWhere }) : 0;
  const trashPages = Math.max(1, Math.ceil(trashTotal / 50));
  const currentTrashPage = Math.min(requestedPage, trashPages);
  const [rows, sections, assets, trash] = await Promise.all([
    prisma.storyPlanItem.findMany({
      where: { bookId, workspaceId: session.workspace.id, deletedAt: null },
      take: MAX_PLAN_ITEMS + 1,
      select: {
        id: true,
        parentId: true,
        sectionId: true,
        sortOrder: true,
        version: true,
        kind: true,
        status: true,
        title: true,
        summary: true,
        visual: true,
        goal: true,
        conflict: true,
        outcome: true,
        targetWords: true,
        createdAt: true,
      },
    }),
    prisma.bookSection.findMany({
      where: { bookId, deletedAt: null },
      take: 1001,
      select: { id: true, parentId: true, title: true, type: true, sortOrder: true, version: true },
    }),
    listBookAssets(session, bookId),
    canManage
      ? prisma.storyPlanItem.findMany({
          where: trashWhere,
          orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
          skip: (currentTrashPage - 1) * 50,
          take: 50,
          select: { id: true, title: true, kind: true, deletedAt: true },
        })
      : Promise.resolve([]),
  ]);
  if (sections.length > 1000)
    throw new PlanError("Este tablero admite manuscritos de hasta 1.000 secciones.");
  return {
    book,
    trash: {
      items: trash.map((n) => ({ ...n, deletedAt: n.deletedAt!.toISOString() })),
      total: trashTotal,
      page: currentTrashPage,
      pages: trashPages,
    },
    assets: assets.map((asset) => ({ ...asset, url: bookAssetThumbnailUrl(asset.url) })),
    items: planOrder(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))),
    sections,
    manuscriptKey: manuscriptKey(sections),
  };
}
export type ModularPlanData = NonNullable<Awaited<ReturnType<typeof loadModularPlan>>>;
export type ModularItem = ModularPlanData["items"][number];
