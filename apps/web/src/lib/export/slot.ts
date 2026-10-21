import "server-only";

/**
 * Una exportación cada vez en cada instancia.
 *
 * Render Free da una sola instancia y 512 MB. La exportación de un libro con
 * fotografías llega a 367 MB (medido con `pnpm stress:export`): dos a la vez
 * dejarían la instancia sin memoria. En lugar de dejar que la plataforma
 * mate el proceso, la segunda petición recibe un aviso claro.
 *
 * El bloqueo es por proceso: con varias instancias, cada una permite una
 * exportación. Es la misma limitación que el límite de intentos de acceso, y
 * por el mismo motivo: no hay un almacén compartido.
 */

interface SlotState {
  /** Momento en que se reservations el hueco, para poder caducarlo. */
  desde: number | null;
}

const globalState = globalThis as unknown as {
  __escribiendoExportSlot?: SlotState;
};

const state: SlotState =
  globalState.__escribiendoExportSlot ?? (globalState.__escribiendoExportSlot = { desde: null });

/** Tiempo máximo que se reserva el hueco antes de considerarlo caducado. */
const MAXIMO_MS = 10 * 60 * 1_000;

/**
 * Reserva el hueco de exportación.
 *
 * Devuelve `false` si ya hay una exportación en marcha en esta instancia.
 */
export function reservarHuecoDeExportacion(): boolean {
  const ahora = Date.now();

  if (state.desde !== null && ahora - state.desde > MAXIMO_MS) {
    // La exportación anterior se quedó colgada: el hueco se libera.
    state.desde = null;
  }

  if (state.desde !== null) {
    return false;
  }

  state.desde = ahora;

  return true;
}

/** Libera el hueco de exportación. */
export function liberarHuecoDeExportacion(): void {
  state.desde = null;
}

/** Indica si hay una exportación en marcha en esta instancia. */
export function hayExportacionEnCurso(): boolean {
  return state.desde !== null && Date.now() - state.desde <= MAXIMO_MS;
}
