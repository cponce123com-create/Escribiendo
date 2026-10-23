import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
import { requireSession } from "@/lib/auth/session";
import { canPerform } from "@/lib/books/permissions";
import { prisma } from "@/lib/db";
import { getWorkspaceStats } from "@/lib/writing/goals";
import { dashboardWeek } from "@/lib/ui/dashboard";
import { auditActionLabel, BOOK_STATUS_LABELS, formatDateTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "Panel" };

export default async function DashboardPage() {
  const session = await requireSession();
  const workspaceId = session.workspace.id;
  const [aggregate, books, activity, members, writing] = await Promise.all([
    prisma.book.aggregate({
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
      _sum: { wordCount: true, chapterCount: true },
    }),
    prisma.book.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        status: true,
        wordCount: true,
        chapterCount: true,
        updatedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    getWorkspaceStats(session, 7),
  ]);
  return (
    <Dashboard
      name={session.user.name}
      canCreate={canPerform(session.workspace.role, "book:create")}
      totals={{
        books: aggregate._count._all,
        words: aggregate._sum.wordCount ?? 0,
        chapters: aggregate._sum.chapterCount ?? 0,
        members,
      }}
      books={books.map((book) => ({
        ...book,
        status: BOOK_STATUS_LABELS[book.status] ?? book.status,
        updated: formatDateTime(book.updatedAt),
      }))}
      activity={activity.map((entry) => ({
        id: entry.id,
        label: auditActionLabel(entry.action),
        detail: `${entry.actor?.name ?? "Sistema"} · ${formatDateTime(entry.createdAt)}`,
      }))}
      week={dashboardWeek(writing.days)}
    />
  );
}
