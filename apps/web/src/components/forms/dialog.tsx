"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  /** Si el diálogo está abierto. */
  abierto: boolean;
  titulo: string;
  /** Explicación breve de lo que se pide. */
  descripcion?: string;
  /** Se llama al cerrar, con el botón o con la tecla Escape. */
  onCerrar: () => void;
  /** Contenido del diálogo. */
  children: ReactNode;
}

/**
 * Diálogo modal sencillo.
 *
 * Sustituye a las ventanas del navegador (`prompt` y `alert`), que bloquean la
 * interfaz, no se pueden validar mientras se escribe y no las anuncia bien un
 * lector de pantalla. Escape cierra y el foco entra en el diálogo.
 */
export function Dialog({ abierto, titulo, descripcion, onCerrar, children }: DialogProps) {
  const tituloId = useId();
  const descripcionId = useId();
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) {
      return;
    }

    const alPulsar = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") {
        onCerrar();
      }
    };

    document.addEventListener("keydown", alPulsar);
    contenedor.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();

    return () => document.removeEventListener("keydown", alPulsar);
  }, [abierto, onCerrar]);

  if (!abierto) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="presentation"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) {
          onCerrar();
        }
      }}
    >
      <div
        ref={contenedor}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descripcion ? descripcionId : undefined}
        className="panel w-full max-w-lg space-y-4 p-6 shadow-lg"
      >
        <div className="space-y-1">
          <h2 id={tituloId} className="font-serif text-xl text-ink">
            {titulo}
          </h2>
          {descripcion ? (
            <p id={descripcionId} className="text-sm leading-relaxed text-ink-soft">
              {descripcion}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
