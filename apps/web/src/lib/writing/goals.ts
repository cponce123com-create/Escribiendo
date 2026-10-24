import "server-only";
import { prisma } from "@/lib/db";
import type { SessionContext } from "@/lib/auth/session";
import {
  computeGoalProgress,
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

/**
 * Revisiones del espacio de trabajo, ordenadas por sección y versión.
 *
 * Solo se cargan las revisiones del periodo que hace falta: el histórico
 * completo de un estudio crece sin parar —cada guardado crea una revisión— y
 * cargarlo entero convertía la página de estadísticas en la más lenta de la
 * aplicación.
 *
 * Para que la primera revisión de cada sección dentro del periodo no cuente
 * todas sus palabras como recién escritas, se añade la última revisión
 * anterior al periodo, que es la referencia del cálculo.
 */
async function loadRevisionSamples(
  session: SessionContext,
  bookId?: string,
  desde?: Date,
): Promise<RevisionSample[]> {
  const secciones = await prisma.bookSection.findMany({
    where: {
      deletedAt: null,
      book: {
        workspaceId: session.workspace.id,
        deletedAt: null,
        ...(bookId ? { id: bookId } : {}),
      },
    },
    select: { id: true },
  });

  if (secciones.length === 0) {
    return [];
  }

  const ids = secciones.map((seccion) => seccion.id);

  // La última revisión de cada sección antes del periodo: es el punto de
  // partida del recuento de palabras.
  const anteriores = desde
    ? await prisma.$queryRaw<
        Array<{ sectionId: string; version: number; wordCount: number; createdAt: Date }>
      >`
        SELECT DISTINCT ON ("sectionId") "sectionId", version, "wordCount", "createdAt"
        FROM section_revisions
        WHERE "sectionId" = ANY(${ids}::uuid[]) AND "createdAt" < ${desde}
        ORDER BY "sectionId", version DESC
      `
    : [];

  const revisiones = await prisma.sectionRevision.findMany({
    where: {
      sectionId: { in: ids },
      ...(desde ? { createdAt: { gte: desde } } : {}),
    },
    orderBy: [{ sectionId: "asc" }, { version: "asc" }],
    select: {
      sectionId: true,
      version: true,
      wordCount: true,
      createdAt: true,
    },
  });

  return [...anteriores, ...revisiones].map((revision) => ({
    sectionId: revision.sectionId,
    version: revision.version,
    wordCount: revision.wordCount,
    createdAt: revision.createdAt,
  }));
}

/**
 * Caché corta de las revisiones ya cargadas.
 *
 * La página de estadísticas necesita las mismas revisiones para los objetivos
 * y para el resumen: sin caché, se cargaban dos veces. Se guarda un minuto,
 * lo justo para que las dos llamadas de la misma página no repitan el trabajo.
 */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRADAS = 50;
const cache = new Map<string, { expira: number; muestras: RevisionSample[] }>();

/** Revisiones del periodo, con una caché muy corta. */
async function muestrasDelPeriodo(
  session: SessionContext,
  bookId: string | undefined,
  desde: Date,
): Promise<RevisionSample[]> {
  const clave = `${session.workspace.id}:${bookId ?? "*"}:${desde.getTime()}`;
  const guardado = cache.get(clave);

  if (guardado && guardado.expira > Date.now()) {
    return guardado.muestras;
  }

  const muestras = await loadRevisionSamples(session, bookId, desde);

  if (cache.size >= CACHE_MAX_ENTRADAS) {
    const masAntiguo = cache.keys().next().value;

    if (masAntiguo !== undefined) {
      cache.delete(masAntiguo);
    }
  }

  cache.set(clave, { expira: Date.now() + CACHE_TTL_MS, muestras });

  return muestras;
}

/** Palabras escritas en cada uno de los periodos indicados. */
export async function wordsWrittenInPeriod(
  session: SessionContext,
  periods: Array<{ start: Date; end: Date }>,
  bookId?: string,
): Promise<number[]> {
  if (periods.length === 0) {
    return [];
  }

  // Solo se cargan las revisiones del periodo más amplio que hace falta. Si
  // el objetivo es de un libro, las muestras se limitan a ese libro: un
  // objetivo de «La novela» no puede contar las palabras de otro manuscrito.
  const desde = new Date(Math.min(...periods.map((period) => period.start.getTime())));
  const daily = computeWordsPerDay(await muestrasDelPeriodo(session, bookId, desde));

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

  // Los objetivos generales y los de cada libro se calculan por separado:
  // mezclarlos haría que un objetivo de un libro contara las palabras de
  // todos los manuscritos del espacio de trabajo.
  const indicesPorLibro = new Map<string | null, number[]>();
  goals.forEach((goal, index) => {
    const indices = indicesPorLibro.get(goal.bookId) ?? [];
    indices.push(index);
    indicesPorLibro.set(goal.bookId, indices);
  });

  const palabrasPorObjetivo = new Array<number>(goals.length).fill(0);

  await Promise.all(
    [...indicesPorLibro.entries()].map(async ([bookId, indices]) => {
      const written = await wordsWrittenInPeriod(
        session,
        indices.map((index) => ({
          start: goals[index]!.periodStart,
          end: goals[index]!.periodEnd,
        })),
        bookId ?? undefined,
      );

      indices.forEach((index, position) => {
        palabrasPorObjetivo[index] = written[position] ?? 0;
      });
    }),
  );

  return goals.map((goal, index) => {
    const words = palabrasPorObjetivo[index] ?? 0;

    return {
      id: goal.id,
      bookId: goal.bookId,
      bookTitle: goal.book?.title ?? null,
      periodStart: goal.periodStart,
      periodEnd: goal.periodEnd,
      targetWords: goal.targetWords,
      wordsWritten: words,
      progress: computeGoalProgress(words, goal.targetWords),
    };
  });
}

/** Estadísticas de escritura de un libro en los últimos días. */
export async function getBookStats(
  session: SessionContext,
  bookId: string,
  days: number,
): Promise<PeriodStat> {
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const samples = await muestrasDelPeriodo(session, bookId, desde);
  const daily = computeWordsPerDay(samples);
  const since = dayKey(desde);

  return summarizePeriod(daily.filter((day) => day.date >= since));
}

/** Estadísticas de escritura de todo el espacio de trabajo. */
export async function getWorkspaceStats(
  session: SessionContext,
  days: number,
): Promise<PeriodStat> {
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const samples = await muestrasDelPeriodo(session, undefined, desde);
  const daily = computeWordsPerDay(samples);
  const since = dayKey(desde);

  return summarizePeriod(daily.filter((day) => day.date >= since));
}

/**
 * Días en los que se añadieron palabras en el espacio de trabajo.
 *
 * La agregación se realiza en Postgres para que la racha pueda ser exacta sin
 * cargar el historial completo de revisiones en memoria ni limitarla a un
 * periodo arbitrario. Solo se devuelven las fechas activas agregadas.
 */
export async function getWorkspaceActivityDays(
  session: SessionContext,
): Promise<Array<{ date: string; words: number }>> {
  return prisma.$queryRaw<Array<{ date: string; words: number }>>`
    WITH workspace_sections AS (
      SELECT section.id
      FROM book_sections AS section
      INNER JOIN books AS book ON book.id = section."bookId"
      WHERE book."workspaceId" = ${session.workspace.id}::uuid
        AND book."deletedAt" IS NULL
        AND section."deletedAt" IS NULL
    ), revision_deltas AS (
      SELECT
        (revision."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') AS local_created_at,
        GREATEST(
          revision."wordCount" - LAG(revision."wordCount", 1, 0)
            OVER (PARTITION BY revision."sectionId" ORDER BY revision.version),
          0
        ) AS added_words
      FROM section_revisions AS revision
      INNER JOIN workspace_sections AS section ON section.id = revision."sectionId"
    )
    SELECT
      TO_CHAR(local_created_at::date, 'YYYY-MM-DD') AS date,
      SUM(added_words)::int AS words
    FROM revision_deltas
    WHERE added_words > 0
    GROUP BY local_created_at::date
    ORDER BY local_created_at::date DESC
  `;
}
