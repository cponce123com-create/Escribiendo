import type { Metadata } from "next";
import { GoalsPanel } from "@/components/writing/goals-panel";
import { WritingPreferencesPanel } from "@/components/writing/writing-preferences";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getWorkspaceStats, listGoals } from "@/lib/writing/goals";
import { formatNumber } from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Estadísticas de escritura",
};

const PERIOD_DAYS = 30;

export default async function StatsPage() {
  const session = await requireSession();

  const [goals, stats, books] = await Promise.all([
    listGoals(session),
    getWorkspaceStats(session, PERIOD_DAYS),
    prisma.book.findMany({
      where: { workspaceId: session.workspace.id, deletedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const maxWords = stats.days.reduce((max, day) => Math.max(max, day.words), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Escritura asistida</p>
        <h1 className="font-serif text-[clamp(1.8rem,3.5vw,2.6rem)] leading-[1.05] text-ink">
          Estadísticas y objetivos
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Las palabras escritas se calculan comparando cada revisión con la anterior de su sección,
          de modo que las cifras reflejan el manuscrito real y no un contador aparte.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="resumen del periodo">
        <div className="stat-card">
          <p className="meta-label">Palabras escritas</p>
          <p className="mt-4 font-serif text-3xl tabular-nums text-ink">
            {formatNumber(stats.total)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Últimos {PERIOD_DAYS} días</p>
        </div>
        <div className="stat-card">
          <p className="meta-label">Días con escritura</p>
          <p className="mt-4 font-serif text-3xl tabular-nums text-ink">
            {formatNumber(stats.activeDays)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Media: {formatNumber(stats.averagePerDay)} / día
          </p>
        </div>
        <div className="stat-card">
          <p className="meta-label">Objetivos activos</p>
          <p className="mt-4 font-serif text-3xl tabular-nums text-ink">
            {formatNumber(goals.length)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Propios de tu cuenta</p>
        </div>
      </section>

      {stats.days.length > 0 ? (
        <section className="panel p-6" aria-label="palabras por día">
          <p className="meta-label">Actividad diaria</p>
          <h2 className="mt-1.5 font-serif text-2xl text-ink">Palabras por día</h2>

          <ul className="mt-5 space-y-1.5">
            {stats.days.map((day) => (
              <li key={day.date} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 font-mono text-ink-muted">{day.date}</span>
                <span
                  className="h-3 shrink-0 rounded-sm bg-accent/70"
                  style={{
                    width: `${maxWords > 0 ? Math.max(2, (day.words / maxWords) * 100) : 2}%`,
                  }}
                />
                <span className="shrink-0 tabular-nums text-ink-soft">{day.words}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel p-6" aria-label="objetivos de escritura">
        <p className="meta-label">Objetivos</p>
        <h2 className="mt-1.5 font-serif text-2xl text-ink">Palabras por periodo</h2>
        <div className="mt-5">
          <GoalsPanel books={books} goals={goals} />
        </div>
      </section>

      <WritingPreferencesPanel />
    </div>
  );
}
