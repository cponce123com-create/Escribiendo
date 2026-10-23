"use client";

import { useState, type ReactNode } from "react";

interface ConfirmButtonProps {
  /** Texto del botón que pide la acción. */
  label: string;
  /** Texto del botón que la confirma. */
  confirmLabel: string;
  /** Texto para el lector de pantalla: qué va a pasar exactamente. */
  description: string;
  /** Contenido del formulario que se envía al confirmar. */
  children?: ReactNode;
  className?: string;
}

/**
 * Botón que pide confirmación antes de una acción destructiva.
 *
 * Retirar a alguien, revocar una invitación o borrar un perfil no tiene
 * papelera: un clic de más no debería bastar. El botón pide confirmación en
 * el sitio, sin ventanas del navegador, y el segundo clic es el que envía el
 * formulario.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  description,
  children,
  className = "btn btn-ghost",
}: ConfirmButtonProps) {
  const [pidiendo, setPidiendo] = useState(false);

  if (!pidiendo) {
    return (
      <button
        type="button"
        className={className}
        title={description}
        onClick={() => setPidiendo(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2" role="group" aria-label={description}>
      {/* El botón que confirma no cambia el estado al pulsarlo: si se
          desmontara antes de enviar el formulario, la acción no se
          ejecutaría. */}
      <button type="submit" className={className} title={description}>
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setPidiendo(false)}>
        Cancelar
      </button>
      {children}
    </span>
  );
}
