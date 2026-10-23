import { StudioRail } from "@/components/books/studio-rail";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/app/nav-links";

import { BookIcon, ChartIcon, LayoutIcon, LogOutIcon, UsersIcon } from "@/components/icons";
import { logoutAction } from "@/lib/auth/actions";
import type { SessionContext } from "@/lib/auth/session";
import { getInitials } from "@/lib/ui/format";
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

        <div className="px-4 py-4">
          <NavLinks />
        </div>
        <div className="sidebar-tools mx-5 border-t border-line py-5">
          <p className="meta-label mb-3">Herramientas</p>
          <nav aria-label="Herramientas de escritura">
            {[
              { label: "Planificación", icon: LayoutIcon },
              { label: "Personajes", icon: UsersIcon },
              { label: "Mundos", icon: BookIcon },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="nav-item-future" aria-disabled="true">
                <Icon />
                <span>{label}</span>
                <span className="phase-chip">Próximamente</span>
              </div>
            ))}
            <Link className="nav-item" href="/stats">
              <ChartIcon />
              <span>Objetivos</span>
            </Link>
          </nav>
        </div>
        <div className="mx-5 border-t border-line py-5">
          <p className="meta-label mb-3">Ayuda</p>
          <Link href="/guide" className="nav-item">
            <BookIcon />
            <span>Guía y recursos</span>
          </Link>
        </div>
        <blockquote className="sidebar-quote mx-5 mb-6">
          <BookIcon className="mx-auto mb-3 size-5 text-accent" />
          Un lugar para las historias
          <br />
          que merecen ser contadas.
        </blockquote>

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
