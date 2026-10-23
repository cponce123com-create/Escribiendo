import Link from "next/link";
import { StudioIcon } from "@/components/books/studio-icon";
import {
  ArrowRightIcon,
  BookIcon,
  PenIcon,
  UsersIcon,
  NoteIcon,
  ChartIcon,
  LayoutIcon,
} from "@/components/icons";
import { formatNumber } from "@/lib/ui/format";

export interface DashboardProps {
  name: string;
  canCreate: boolean;
  totals: { books: number; words: number; chapters: number; members: number };
  books: {
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    status: string;
    wordCount: number;
    chapterCount: number;
    updated: string;
  }[];
  activity: { id: string; label: string; detail: string }[];
  week: { date: string; label: string; words: number }[];
}

export function Dashboard({ name, canCreate, totals, books, activity, week }: DashboardProps) {
  const activeDays = week.filter((day) => day.words > 0).length;
  const stats = [
    { label: "Libros", value: totals.books, detail: "En tu biblioteca", icon: BookIcon },
    { label: "Palabras", value: totals.words, detail: "En tus manuscritos", icon: PenIcon },
    {
      label: "Capítulos",
      value: totals.chapters,
      detail: "Historias en construcción",
      icon: LayoutIcon,
    },
    { label: "Equipo", value: totals.members, detail: "Personas en el estudio", icon: UsersIcon },
  ];
  return (
    <div className="dashboard-grid">
      <div className="dashboard-primary">
        <section className="panel dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Panel del estudio</p>
            <h1>Tu estudio está listo para crear.</h1>
            <p>
              Bienvenido/a, {name}. Un espacio para tus ideas, tus historias y todo lo que está por
              venir.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {canCreate && (
                <Link href="/books/new" className="btn btn-primary">
                  <StudioIcon name="plus" className="size-4" /> Nuevo libro
                </Link>
              )}
              <Link
                href={books[0] ? `/books/${books[0].id}` : "/books"}
                className="btn btn-secondary"
              >
                <PenIcon className="size-4" />
                {books[0] ? "Continuar escribiendo" : "Explorar biblioteca"}
              </Link>
            </div>
          </div>
        </section>
        <section className="dashboard-stats" aria-label="Resumen del estudio">
          {stats.map(({ label, value, detail, icon: Icon }) => (
            <div className="stat-card" key={label}>
              <span className="dashboard-icon">
                <Icon />
              </span>
              <div>
                <p className="meta-label">{label}</p>
                <p className="dashboard-value">{formatNumber(value)}</p>
                <p className="text-xs text-ink-muted">{detail}</p>
              </div>
            </div>
          ))}
        </section>
        <section className="panel dashboard-books" aria-labelledby="recent-books">
          <div className="dashboard-panel-heading">
            <h2 id="recent-books">
              <BookIcon /> Manuscritos recientes
            </h2>
            <Link href="/books">
              Ver biblioteca <ArrowRightIcon />
            </Link>
          </div>
          {books.length === 0 ? (
            <div className="dashboard-empty">
              <BookIcon className="mx-auto size-9 text-accent" />
              <h3>Tu próxima historia empieza aquí.</h3>
              <p>Crea tu primer libro para reunir capítulos, notas e ideas.</p>
            </div>
          ) : (
            books.map((book, index) => (
              <article key={book.id} className="dashboard-book">
                <Link
                  href={`/books/${book.id}`}
                  className={`dashboard-book-cover dashboard-book-cover-${index}`}
                  aria-label={`Abrir ${book.title}`}
                >
                  <BookIcon />
                  <span>{book.title}</span>
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/books/${book.id}`} className="dashboard-book-title">
                      {book.title}
                    </Link>
                    <span className="dashboard-badge">{book.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{book.subtitle ?? "Manuscrito"}</p>
                  {book.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{book.description}</p>
                  )}
                  <p className="mt-3 text-xs text-ink-muted">
                    {formatNumber(book.wordCount)} palabras · {book.chapterCount} capítulos
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">Actualizado: {book.updated}</p>
                </div>
                <Link href={`/books/${book.id}`} className="btn btn-secondary btn-sm">
                  Continuar <ArrowRightIcon className="size-3.5" />
                </Link>
              </article>
            ))
          )}
          {canCreate && (
            <Link href="/books/new" className="dashboard-create">
              <StudioIcon name="plus" className="size-4" /> Crear un nuevo libro
            </Link>
          )}
        </section>
        <aside className="panel dashboard-tip">
          <div className="dashboard-tip-image" aria-hidden="true" />
          <div>
            <p className="meta-label">Un momento para tu escritura</p>
            <h2>Las grandes historias se escriben un día a la vez.</h2>
            <p>Define un objetivo pequeño y reserva un momento para avanzar en tu manuscrito.</p>
          </div>
          <Link href="/stats" className="btn btn-secondary btn-sm">
            Mis objetivos <ArrowRightIcon className="size-4" />
          </Link>
        </aside>
      </div>
      <div className="dashboard-secondary">
        <section className="panel dashboard-week">
          <p className="meta-label">Tu ritmo de escritura</p>
          <h2>
            {activeDays} <span>{activeDays === 1 ? "día escribiendo" : "días escribiendo"}</span>
          </h2>
          <p className="text-sm text-ink-soft">
            Cada palabra cuenta. Sigue dando vida a tus ideas.
          </p>
          <div className="dashboard-landscape" aria-hidden="true" />
          <ul aria-label="Actividad de los últimos siete días">
            {week.map((day) => (
              <li key={day.date}>
                <span>{day.label}</span>
                <span
                  className={day.words > 0 ? "day-active" : ""}
                  title={`${day.date}: ${day.words} palabras`}
                  aria-label={`${day.date}: ${day.words} palabras`}
                >
                  {day.words > 0 ? "✓" : "·"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">Últimos 7 días · zona horaria del estudio</p>
        </section>
        <section className="panel p-5">
          <h2 className="dashboard-small-title">Acciones rápidas</h2>
          <div className="dashboard-actions">
            {canCreate && (
              <Link href="/books/new">
                <BookIcon />
                Nuevo libro
              </Link>
            )}
            <Link href="/notes">
              <NoteIcon />
              Mis notas
            </Link>
            <Link href="/stats">
              <ChartIcon />
              Ver estadísticas
            </Link>
            <Link href="/team">
              <UsersIcon />
              Ver equipo
            </Link>
          </div>
        </section>
        <section className="panel p-5" aria-labelledby="recent-activity">
          <h2 id="recent-activity" className="dashboard-small-title">
            Actividad reciente
          </h2>
          <div className="mt-3">
            {activity.length ? (
              activity.map((entry) => (
                <div className="activity-row" key={entry.id}>
                  <span className="dashboard-icon">
                    <PenIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{entry.label}</p>
                    <p className="mt-1 text-xs text-ink-muted">{entry.detail}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-5 text-sm text-ink-muted">
                La actividad del estudio aparecerá aquí cuando empieces a trabajar.
              </p>
            )}
          </div>
        </section>
        <section className="panel dashboard-progress">
          <p className="meta-label">Tu historia, paso a paso</p>
          <h2>{formatNumber(totals.words)} palabras</h2>
          <p className="text-sm text-ink-soft">
            Repartidas en {totals.chapters} capítulos de tu biblioteca.
          </p>
          <Link
            href="/stats"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent"
          >
            Ver objetivos y progreso <ArrowRightIcon className="size-4" />
          </Link>
          <blockquote>“Cada página es un paso más cerca de tu libro.”</blockquote>
        </section>
      </div>
    </div>
  );
}
