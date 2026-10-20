import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/app/nav-links";
import {
  BookIcon,
  DownloadIcon,
  LayoutIcon,
  LogOutIcon,
  PenIcon,
  UsersIcon,
} from "@/components/icons";
import { logoutAction } from "@/lib/auth/actions";
import type { SessionContext } from "@/lib/auth/session";
import { getInitials, WORKSPACE_ROLE_LABELS } from "@/lib/ui/format";

const FUTURE_SECTIONS = [
  { label: "Biblioteca", phase: "Fase 2", icon: BookIcon },
  { label: "Editor", phase: "Fase 3", icon: PenIcon },
  { label: "Maquetación", phase: "Fase 4", icon: LayoutIcon },
  { label: "Exportaciones", phase: "Fase 5", icon: DownloadIcon },
  { label: "Equipo", phase: "Fase 6", icon: UsersIcon },
] as const;

interface SidebarProps {
  session: SessionContext;
}

export function Sidebar({ session }: SidebarProps) {
  return (
    <aside className="app-sidebar hidden min-h-svh flex-col border-r lg:flex">
      <div className="px-5 pb-5 pt-6">
        <Logo href="/dashboard" />
      </div>

      <div className="mx-5 border-y border-line py-4">
        <p className="meta-label">Espacio de trabajo</p>
        <p className="mt-1.5 font-serif text-lg leading-tight text-ink">{session.workspace.name}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {WORKSPACE_ROLE_LABELS[session.workspace.role] ?? session.workspace.role}
        </p>
      </div>

      <div className="px-3 py-4">
        <p className="meta-label px-2 pb-2">Estudio</p>
        <NavLinks />
      </div>

      <div className="px-3">
        <p className="meta-label px-2 pb-2">Próximas fases</p>
        <div aria-label="Secciones todavía no disponibles">
          {FUTURE_SECTIONS.map((section) => {
            const Icon = section.icon;

            return (
              <div className="nav-item-future" key={section.label}>
                <Icon />
                <span>{section.label}</span>
                <span className="phase-chip">{section.phase}</span>
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
            <span className="block truncate text-sm font-medium text-ink">{session.user.name}</span>
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
    </aside>
  );
}
