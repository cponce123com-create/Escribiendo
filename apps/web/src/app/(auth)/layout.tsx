import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="auth-panel relative hidden min-h-svh flex-col justify-between p-12 lg:flex xl:p-16">
        <Logo inverse href="/login" className="relative z-10" />
        <div className="relative z-10 max-w-md py-16">
          <p className="eyebrow eyebrow-inverse">Editorial No Para Todos</p>
          <blockquote className="auth-quote mt-7 text-[#f4eadb]">
            «Un libro no se escribe solo. Se ordena, se corrige y se compone hasta que cada página
            sostiene la anterior.»
          </blockquote>
          <p className="mt-7 max-w-sm text-sm leading-relaxed text-[#f4eadb]/60">
            ESCRIBIENDO reúne el manuscrito, la mirada editorial y la maquetación en un mismo
            espacio privado. Sin ruido, sin atajos y sin nada que no pertenezca al libro.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-3 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[#f4eadb]/45">
          <span className="status-dot" aria-hidden="true" />
          Acceso privado · Fase 1
        </div>
      </aside>

      <main className="relative flex min-h-svh flex-col">
        <div className="flex items-center justify-between gap-4 px-6 py-6 sm:px-10">
          <div className="lg:hidden">
            <Logo href="/login" />
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center px-6 pb-10 sm:px-10 lg:px-14">
          <div className="auth-form-wrap">{children}</div>
        </div>

        <footer className="px-6 pb-7 text-center text-[0.68rem] leading-relaxed text-ink-muted sm:px-10">
          Plataforma privada de EDITORIAL NO PARA TODOS. El acceso no es público.
        </footer>
      </main>
    </div>
  );
}
