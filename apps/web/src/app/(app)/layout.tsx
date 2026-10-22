import type { ReactNode } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Si la base de datos no tiene el esquema que espera el código,
  // `requireSession` lleva a la pantalla de migración pendiente.
  const session = await requireSession();

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>

      <Sidebar session={session} />

      <div className="flex min-h-svh min-w-0 flex-col">
        <AppTopbar session={session} />

        <main id="contenido" className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>

        <footer className="border-t border-line px-4 py-5 text-xs text-ink-muted sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>ESCRIBIENDO · Plataforma privada de EDITORIAL NO PARA TODOS</span>
            <span>Fase 1 · Fundaciones y acceso</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
