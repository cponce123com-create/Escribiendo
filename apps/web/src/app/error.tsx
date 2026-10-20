"use client";

import { useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { AlertIcon } from "@/components/icons";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Error de interfaz", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <Logo />
        <div className="panel mt-8 p-7">
          <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger">
            <AlertIcon className="size-5" />
          </span>
          <p className="eyebrow mt-5">Error inesperado</p>
          <h1 className="mt-3 font-serif text-3xl text-ink">
            No se ha podido completar la página.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            El fallo ha quedado registrado en el servidor. Puedes reintentar la operación. Si el
            problema continúa, revisa el estado de la base de datos y los registros de Render.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-xs text-ink-muted">Referencia: {error.digest}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Reintentar
            </button>
            <a className="btn btn-secondary" href="/login">
              Volver al acceso
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
