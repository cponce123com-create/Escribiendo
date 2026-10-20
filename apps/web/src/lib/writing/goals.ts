import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import {
  computeWordsPerDay,
  dayKey,
  summarizePeriod,
  type PeriodStat,
  type RevisionSample,
} from "./stats";

/**
 * Objetivos de escritura y estadísticas por periodo.
 *
 * El objetivo por libro vive en `books.targetWordCount`. El objetivo por
 * periodo es propio de cada persona y se guarda en `writing_goals`.
 */

export interface GoalSummary {
  id: string;
  bookId: string | null;
  bookTitle: string | null;
  periodStart: Date;
  periodEnd: Date;
  targetWords: number;
  wordsWritten: number;
  progress: number;
}

/** Revisiones del espacio de trabajo, ordenadas por sección y versión. */
async function loadRevisionSamples(
  session: SessionContext,
  bookId?: string,
): Promise<RevisionSample[]> {
  const revisions = await prisma.sectionRevision.findMany({
    where: {
      section: {
        deletedAt: null,
        book: {
          workspaceId: session.workspace.id,
          deletedAt: null,
          ...(bookId ? { id: bookId } : {}),
        },
      },
    },
    orderBy: [{ sectionId: "asc" }, { version: "asc" }],
    select: {
      version: true,
      wordCount: true,
      createdAt: true,
      section: { select: { id: true } },
    },
  });

  return revisions.map((revision) => ({
    sectionId: revision.section.id,
    version: revision.version,
    wordCount: revision.wordCount,
    createdAt: revision.createdAt,
  }));
}

/** Palabras escritas en cada uno de los periodos indicados. */
export async function wordsWrittenInPeriod(
  session: SessionContext,
  periods: Array<{ start: Date; end: Date }>,
): Promise<number[]> {
  if (periods.length === 0) {
    return [];
  }

  const daily = computeWordsPerDay(await loadRevisionSamples(session));

  return periods.map((period) => {
    const start = dayKey(period.start);
    const end = dayKey(period.end);

    return daily
      .filter((day) => day.date >= start && day.date <= end)
      .reduce((sum, day) => sum + day.words, 0);
  });
}

/** Objetivos de la persona en el espacio de trabajo. */
export async function listGoals(session: SessionContext): Promise<GoalSummary[]> {
  const goals = await prisma.writingGoal.findMany({
    where: {
      userId: session.user.id,
      // Un objetivo general no está anclado a ningún libro, de modo que el
      // filtro por espacio de trabajo se aplica solo a los que sí lo están.
      OR: [{ bookId: null }, { book: { workspaceId: session.workspace.id, deletedAt: null } }],
    },
    orderBy: { periodStart: "desc" },
    select: {
      id: true,
      bookId: true,
      periodStart: true,
      periodEnd: true,
      targetWords: true,
      book: { select: { title: true } },
    },
  });

  if (goals.length === 0) {
    return [];
  }

  const written = await wordsWrittenInPeriod(
    session,
    goals.map((goal) => ({ start: goal.periodStart, end: goal.periodEnd })),
  );

  return goals.map((goal, index) => {
    const words = written[index] ?? 0;

    return {
      id: goal.id,
      bookId: goal.bookId,
      bookTitle: goal.book?.title ?? null,
      periodStart: goal.periodStart,
      periodEnd: goal.periodEnd,
      targetWords: goal.targetWords,
      wordsWritten: words,
      progress: Math.min(100, Math.round((words / goal.targetWords) * 10000) / 100),
    };
  });
}

/** Estadísticas de escritura de un libro en los últimos días. */
export async function getBookStats(
  session: SessionContext,
  bookId: string,
  days: number,
): Promise<PeriodStat> {
  const samples = await loadRevisionSamples(session, bookId);
  const daily = computeWordsPerDay(samples);
  const since = dayKey(new Date(Date.now() - days * 24 * 60 * 60 * 1_000));

  return summarizePeriod(daily.filter((day) => day.date >= since));
}

/** Estadísticas de escritura de todo el espacio de trabajo. */
export async function getWorkspaceStats(
  session: SessionContext,
  days: number,
): Promise<PeriodStat> {
  const samples = await loadRevisionSamples(session);
  const daily = computeWordsPerDay(samples);
  const since = dayKey(new Date(Date.now() - days * 24 * 60 * 60 * 1_000));

  return summarizePeriod(daily.filter((day) => day.date >= since));
}
