import type { ReactNode } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { EsquemaDesactualizado } from "@/components/app/schema-error";
import { requireSession } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let session;

  try {
    session = await requireSession();
  } catch (error) {
    // Si la base de datos no tiene el esquema que espera el código, se dice
    // qué hacer en vez de dejar un error sin explicación.
    if (isAppError(error) && error.code === "CONFIGURATION_ERROR") {
      return <EsquemaDesactualizado />;
    }

    throw error;
  }

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
