import { StudioRail } from "@/components/books/studio-rail";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/app/nav-links";
import { WorkspaceSwitcher } from "@/components/app/workspace-switcher";
import { DownloadIcon, LayoutIcon, LogOutIcon, UsersIcon } from "@/components/icons";
import { logoutAction } from "@/lib/auth/actions";
import type { SessionContext } from "@/lib/auth/session";
import { getInitials, WORKSPACE_ROLE_LABELS } from "@/lib/ui/format";
import { UPCOMING_PHASES } from "@/lib/ui/phases";

/** Icono de cada fase pendiente. */
const PHASE_ICONS: Record<string, typeof DownloadIcon> = {
  exportacion: DownloadIcon,
  equipo: UsersIcon,
  operacion: LayoutIcon,
};

interface SidebarProps {
  session: SessionContext;
}

export function Sidebar({ session }: SidebarProps) {
  return (
    <aside
      id="navegacion-principal"
      className="app-sidebar hidden min-h-svh flex-col border-r lg:flex"
      aria-label="Barra lateral principal"
    >
      <StudioRail />
      <div className="standard-sidebar-content contents">
        <div className="px-5 pb-5 pt-6">
          <Logo href="/dashboard" />
        </div>

        <div className="mx-5 border-y border-line py-4">
          <p className="meta-label">Espacio de trabajo</p>
          <p className="mt-1.5 font-serif text-lg leading-tight text-ink">
            {session.workspace.name}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {WORKSPACE_ROLE_LABELS[session.workspace.role] ?? session.workspace.role}
          </p>
          <WorkspaceSwitcher activo={session.workspace} estudios={session.workspaces} />
        </div>

        <div className="px-3 py-4">
          <p className="meta-label px-2 pb-2">Estudio</p>
          <NavLinks />
        </div>

        <div className="px-3">
          <p className="meta-label px-2 pb-2">Próximas fases</p>
          <div aria-label="Secciones todavía no disponibles">
            {UPCOMING_PHASES.map((phase) => {
              const Icon = PHASE_ICONS[phase.slug] ?? LayoutIcon;

              return (
                <div className="nav-item-future" key={phase.slug}>
                  <Icon />
                  <span>{phase.label}</span>
                  <span className="phase-chip">Fase {phase.id}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto border-t border-line p-4">
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-sm p-1.5 transition-colors hover:bg-ink/5"
          >
            <span className="avatar" aria-hidden="true">
              {getInitials(session.user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {session.user.name}
              </span>
              <span className="block truncate text-xs text-ink-muted">{session.user.email}</span>
            </span>
          </Link>
          <form action={logoutAction} className="mt-3">
            <button type="submit" className="btn btn-ghost btn-sm w-full justify-start">
              <LogOutIcon className="size-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
