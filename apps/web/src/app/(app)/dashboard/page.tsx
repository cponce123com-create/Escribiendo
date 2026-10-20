import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  LayoutIcon,
  PenIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getCloudinaryConfig } from "@/lib/env";
import {
  auditActionLabel,
  BOOK_STATUS_LABELS,
  formatDateTime,
  formatNumber,
  WORKSPACE_ROLE_LABELS,
} from "@/lib/ui/format";

export const metadata: Metadata = {
  title: "Panel",
};

function CloudinaryStatus(): { label: string; detail: string; tone: "ok" | "warning" } {
  try {
    const config = getCloudinaryConfig();

    if (config) {
      return {
        label: "Configurado",
        detail: `Carpeta ${config.uploadFolder}`,
        tone: "ok",
      };
    }

    return {
      label: "Sin configurar",
      detail: "Las subidas de imágenes responderán 503",
      tone: "warning",
    };
  } catch {
    return {
      label: "Configuración incompleta",
      detail: "Revisa las tres variables de Cloudinary",
      tone: "warning",
    };
  }
}

export default async function DashboardPage() {
  const session = await requireSession();
  const workspaceId = session.workspace.id;

  const [bookAggregate, recentBooks, recentActivity, memberCount, activeSessions] =
    await Promise.all([
      prisma.book.aggregate({
        where: { workspaceId, deletedAt: null },
        _count: { _all: true },
        _sum: { wordCount: true, chapterCount: true },
      }),
      prisma.book.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          subtitle: true,
          status: true,
          wordCount: true,
          chapterCount: true,
          updatedAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 7,
        select: {
          id: true,
          action: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.session.count({
        where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

  const cloudinary = CloudinaryStatus();
  const bookCount = bookAggregate._count._all;
  const wordCount = bookAggregate._sum.wordCount ?? 0;
  const chapterCount = bookAggregate._sum.chapterCount ?? 0;

  const stats = [
    {
      label: "Libros",
      value: formatNumber(bookCount),
      detail: bookCount === 0 ? "Biblioteca preparada" : "En el espacio de trabajo",
      icon: BookIcon,
    },
    {
      label: "Palabras",
      value: formatNumber(wordCount),
      detail:
        chapterCount === 0 ? "Sin capítulos todavía" : `${formatNumber(chapterCount)} capítulos`,
      icon: PenIcon,
    },
    {
      label: "Equipo",
      value: formatNumber(memberCount),
      detail: memberCount === 1 ? "Una cuenta activa" : "Cuentas en el espacio",
      icon: UsersIcon,
    },
    {
      label: "Sesiones",
      value: formatNumber(activeSessions),
      detail: activeSessions === 1 ? "Esta sesión" : "Sesiones activas",
      icon: ShieldIcon,
    },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="panel relative overflow-hidden p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full border border-gold/15 bg-gold/5"
          aria-hidden="true"
        />
        <div className="relative">
          <p className="eyebrow">Panel del estudio</p>
          <h1 className="mt-4 max-w-3xl font-serif text-[clamp(2rem,4vw,3.3rem)] leading-[1.02] text-ink">
            El estudio está listo para empezar.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Bienvenido/a, {session.user.name}. La base técnica, el acceso privado, la biblioteca y
            el modelo editorial están operativos.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-2">
              <span className="status-dot" aria-hidden="true" />
              Base de datos conectada
            </span>
            <span>
              Espacio:{" "}
              <strong className="font-medium text-ink-soft">{session.workspace.name}</strong>
            </span>
            <span>
              Rol:{" "}
              <strong className="font-medium text-ink-soft">
                {WORKSPACE_ROLE_LABELS[session.workspace.role] ?? session.workspace.role}
              </strong>
            </span>
          </div>
        </div>
      </section>

      <section
        aria-label="Resumen del estudio"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div className="stat-card" key={stat.label}>
              <div className="flex items-start justify-between gap-3">
                <p className="meta-label">{stat.label}</p>
                <Icon className="size-4 text-ink-muted" />
              </div>
              <p className="mt-4 font-serif text-3xl tabular-nums text-ink">{stat.value}</p>
              <p className="mt-1 text-xs text-ink-muted">{stat.detail}</p>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)]">
        <section className="panel p-6" aria-labelledby="biblioteca-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="meta-label">Biblioteca</p>
              <h2 id="biblioteca-title" className="mt-1.5 font-serif text-2xl text-ink">
                Manuscritos recientes
              </h2>
            </div>
            <Link className="btn btn-ghost btn-sm" href="/books">
              Ver la biblioteca
            </Link>
          </div>

          {recentBooks.length === 0 ? (
            <div className="mt-7 rounded-sm border border-dashed border-line-strong px-5 py-9 text-center">
              <BookIcon className="mx-auto size-7 text-ink-muted" />
              <p className="mt-3 font-serif text-xl text-ink">La biblioteca aún está vacía.</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
                Crea el primer libro y añade sus capítulos. Cada sección guarda su historial de
                revisiones.
              </p>
              <Link className="btn btn-secondary btn-sm mt-5" href="/books/new">
                Crear libro
              </Link>
            </div>
          ) : (
            <div className="mt-5">
              {recentBooks.map((book) => (
                <div className="activity-row" key={book.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{book.title}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {book.subtitle ?? "Sin subtítulo"} · {formatNumber(book.wordCount)} palabras
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-ink-muted">
                    <span>{BOOK_STATUS_LABELS[book.status] ?? book.status}</span>
                    <span className="status-dot status-dot-muted" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel p-6" aria-labelledby="activity-title">
          <p className="meta-label">Auditoría</p>
          <h2 id="activity-title" className="mt-1.5 font-serif text-2xl text-ink">
            Actividad reciente
          </h2>

          {recentActivity.length === 0 ? (
            <p className="mt-7 text-sm leading-relaxed text-ink-muted">
              Todavía no hay actividad registrada. Los inicios de sesión, cambios de contraseña y
              acciones administrativas aparecerán aquí.
            </p>
          ) : (
            <div className="mt-5">
              {recentActivity.map((entry) => (
                <div className="activity-row" key={entry.id}>
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{auditActionLabel(entry.action)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {entry.actor?.name ?? "Sistema"} · {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                  <span
                    className="mt-1 size-1.5 shrink-0 rounded-full bg-gold/80"
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
          )}

          <Link
            href="/account"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-strong"
          >
            Gestionar mi cuenta
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </section>
      </div>

      <section className="panel p-6" aria-labelledby="status-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="meta-label">Infraestructura</p>
            <h2 id="status-title" className="mt-1.5 font-serif text-2xl text-ink">
              Estado de la plataforma
            </h2>
          </div>
          <span className="text-xs text-ink-muted">Comprobación en tiempo real de la sesión</span>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-1 md:grid-cols-2">
          <StatusRow
            icon={ShieldIcon}
            label="Acceso privado"
            value="Argon2id, sesiones y auditoría"
            status="Operativo"
            tone="ok"
          />
          <StatusRow
            icon={CheckIcon}
            label="Base de datos"
            value="PostgreSQL conectado en esta petición"
            status="Operativa"
            tone="ok"
          />
          <StatusRow
            icon={LayoutIcon}
            label="Cloudinary"
            value={cloudinary.detail}
            status={cloudinary.label}
            tone={cloudinary.tone}
          />
          <StatusRow
            icon={BookIcon}
            label="Biblioteca y editor"
            value="Libros, secciones y revisiones operativas"
            status="Operativo"
            tone="ok"
          />
        </div>
      </section>
    </div>
  );
}

interface StatusRowProps {
  icon: typeof ShieldIcon;
  label: string;
  value: string;
  status: string;
  tone: "ok" | "warning" | "neutral";
}

function StatusRow({ icon: Icon, label, value, status, tone }: StatusRowProps) {
  const dotClass =
    tone === "ok"
      ? "status-dot"
      : tone === "warning"
        ? "status-dot status-dot-warning"
        : "status-dot status-dot-muted";

  return (
    <div className="flex items-start gap-3 border-t border-line py-4 first:border-t-0 md:[&:nth-child(2)]:border-t-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{value}</p>
      </div>
      <span className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">
        <span className={dotClass} aria-hidden="true" />
        {status}
      </span>
    </div>
  );
}
