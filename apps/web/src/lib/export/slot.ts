import "server-only";

/**
 * Una exportación activa por proceso. La reserva no caduca por tiempo:
 * caducar una marca no cancela la generación que sigue consumiendo recursos.
 * Solo su propietario la libera cuando termina (también si falla).
 * Un proceso interrumpido pierde su reserva al reiniciarse.
 */
interface SlotState {
  owner: symbol | null;
}

const globalState = globalThis as unknown as {
  __escribiendoExportSlotV2?: SlotState;
};

const state: SlotState =
  globalState.__escribiendoExportSlotV2 ??
  (globalState.__escribiendoExportSlotV2 = { owner: null });

/** Devuelve una reserva propia, o null si ya hay una exportación activa. */
export function reservarHuecoDeExportacion(): symbol | null {
  if (state.owner !== null) return null;
  const owner = Symbol("exportacion");
  state.owner = owner;
  return owner;
}

/** Una liberación ajena o repetida no afecta a una exportación posterior. */
export function liberarHuecoDeExportacion(owner: symbol): void {
  if (state.owner === owner) state.owner = null;
}

export function hayExportacionEnCurso(): boolean {
  return state.owner !== null;
}
