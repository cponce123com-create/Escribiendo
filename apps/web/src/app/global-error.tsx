"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Este límite sustituye al layout raíz si este falla. Debe incluir <html> y
 * <body>, y no puede depender de componentes que usen el layout global.
 * Los estilos viven en /public para respetar la CSP estricta de estilos.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Error global", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="es">
      <head>
        {/*
          global-error.tsx sustituye al layout raíz, de modo que no hereda sus
          hojas de estilo. La CSP estricta prohíbe los estilos en línea, por
          lo que la única forma válida de dar estilo a esta pantalla es
          enlazar una hoja de estilo servida por el propio origen.
        */}
        {/* eslint-disable-next-line @next/next/no-css-tags -- la CSP estricta prohíbe estilos en línea. */}
        <link rel="stylesheet" href="/global-error.css" />
      </head>
      <body>
        <main className="global-error">
          <p className="global-error__eyebrow">ESCRIBIENDO</p>
          <h1 className="global-error__title">La aplicación no ha podido cargarse.</h1>
          <p className="global-error__text">
            Se ha producido un fallo al inicializar la interfaz. Revisa la configuración del
            servidor y vuelve a intentarlo.
          </p>
          <button type="button" onClick={reset} className="global-error__button">
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
