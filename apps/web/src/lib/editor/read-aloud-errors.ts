const SAFE_READ_ALOUD_ERRORS = [
  "El manuscrito es demasiado grande para cargarlo en la lectura móvil.",
  "El texto seleccionado supera el límite de 10 MB para la lectura móvil. Elige «Este capítulo» o empieza más adelante.",
  "No se pudo preparar la lectura del manuscrito.",
  "Android no pudo iniciar el motor de voz.",
  "Android rechazó un fragmento del texto.",
] as const;

/** Keeps actionable reader errors while hiding arbitrary native/network details. */
export function getReadAloudStartErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";

  return (
    SAFE_READ_ALOUD_ERRORS.find((safeMessage) => message.includes(safeMessage)) ??
    "No se pudo iniciar la lectura. Comprueba tu conexión e inténtalo de nuevo."
  );
}
