import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <Logo />
        <div className="panel mt-8 p-7">
          <p className="eyebrow">Error 404</p>
          <h1 className="mt-3 font-serif text-3xl text-ink">Esta página no existe.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            La dirección puede estar mal escrita o pertenecer a una sección que todavía no forma
            parte de esta fase.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/dashboard">
              Ir al panel
            </Link>
            <Link className="btn btn-secondary" href="/login">
              Volver al acceso
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
