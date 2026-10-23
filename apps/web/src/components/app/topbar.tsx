import { StudioSearch, StudioNotifications } from "@/components/books/studio-topbar";
import Link from "next/link";
import { NavLinks } from "@/components/app/nav-links";
import { Logo } from "@/components/brand/logo";
import { AppSidebarToggle } from "@/components/app/app-shell";
import { LogOutIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { logoutAction } from "@/lib/auth/actions";
import type { SessionContext } from "@/lib/auth/session";
import { getInitials } from "@/lib/ui/format";

interface AppTopbarProps {
  session: SessionContext;
}

export function AppTopbar({ session }: AppTopbarProps) {
  return (
    <header className="app-topbar sticky top-0 z-30 border-b border-line">
      <div className="studio-topbar-inner flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/books" className="studio-brand">
          <strong>ESCRIBIENDO</strong>
          <span>EDITORIAL NO PARA TODOS</span>
        </Link>
        <AppSidebarToggle />
        <div className="studio-search-slot">
          <StudioSearch />
        </div>
        <div className="lg:hidden">
          <Logo href="/dashboard" />
        </div>

        <div className="standard-workspace-label hidden min-w-0 lg:block">
          <p className="meta-label">Estudio privado</p>
          <p className="truncate text-sm font-medium text-ink">{session.workspace.name}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="studio-notification-slot">
            <StudioNotifications />
          </div>
          <Link
            href="/account"
            className="flex items-center gap-2.5 rounded-full border border-line bg-surface/70 py-1 pl-1 pr-3 transition-colors hover:border-line-strong hover:bg-surface"
            aria-label="Abrir mi cuenta"
          >
            <span className="avatar" aria-hidden="true">
              {getInitials(session.user.name)}
            </span>
            <span className="hidden max-w-36 truncate text-xs font-medium text-ink-soft sm:block">
              {session.user.name}
            </span>
          </Link>
          <form action={logoutAction} className="lg:hidden">
            <button
              type="submit"
              className="icon-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOutIcon />
            </button>
          </form>
        </div>
      </div>

      <div className="lg:hidden">
        <NavLinks variant="mobile" />
      </div>
    </header>
  );
}
