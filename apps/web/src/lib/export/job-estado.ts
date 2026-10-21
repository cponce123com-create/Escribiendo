/**
 * Estado de los trabajos de exportación.
 *
 * La cola vive en la base de datos y no hay ningún proceso permanente que la
 * vacíe: el trabajo se genera en el momento en que se pide. Si la generación
 * se queda a medias —un despliegue que se cae, una instancia que se
 * reinicia—, la fila se queda en «procesando» para siempre y la interfaz la
 * muestra como un trabajo en marcha. Estos helpers dicen cuándo hay que
 * darla por interrumpida.
 */

/**
 * Minutos que un trabajo puede quedarse «en proceso» antes de darlo por
 * interrumpido.
 */
export const EXPORT_JOB_TIMEOUT_MINUTES = 15;

/** El mismo margen, en milisegundos. */
export const EXPORT_JOB_TIMEOUT_MS = EXPORT_JOB_TIMEOUT_MINUTES * 60 * 1_000;

/** Estado mínimo de un trabajo para saber si está colgado. */
export interface EstadoTrabajo {
  status: string;
  startedAt: Date | null;
}

/**
 * Indica si un trabajo se quedó a medias.
 *
 * Solo cuenta los que estaban «en proceso»: uno que está pendiente puede
 * llevar un rato esperando sin que eso signifique nada, y uno terminado no
 * se toca.
 */
export function trabajoInterrumpido(job: EstadoTrabajo, ahora: Date = new Date()): boolean {
  if (job.status !== "PROCESSING" || !job.startedAt) {
    return false;
  }

  return ahora.getTime() - job.startedAt.getTime() > EXPORT_JOB_TIMEOUT_MS;
}
