import { AUTOSAVE_MIN_INTERVAL_MS } from "./autosave";
/**
 * Máquina de estados de la sincronización del manuscrito.
 *
 * Es pura, sin navegador ni servidor, para que sus reglas se puedan
 * comprobar con pruebas unitarias: qué estado corresponde a cada suceso, si
 * toca reintentar y con qué espera.
 *
 * La idea que ordena el resto: **el texto no está guardado hasta que el
 * servidor lo confirma**. Antes de eso está en el equipo, y el equipo puede
 * perder la conexión.
 */

export type EditorSyncState =
  /** Sin cambios pendientes. */
  | "idle"
  /** Hay cambios, guardados solo en el equipo. */
  | "local"
  /** Enviando al servidor. */
  | "syncing"
  /** Confirmado por el servidor. */
  | "synced"
  /** Sin conexión: los cambios siguen en el equipo. */
  | "offline"
  /** El servidor no ha podido guardar. */
  | "error"
  /** El servidor tiene una versión más reciente: hay que decidir. */
  | "conflict";

/**
 * Estado que devuelve el guardado de una sección.
 *
 * Cuando hay conflicto, el servidor devuelve **su** versión para que quien
 * escribe pueda compararla con la que tiene en el equipo. No se descarta
 * ninguna de las dos.
 */
export interface SectionConflict {
  serverVersion: number;
  /** Contenido del servidor, en JSON. */
  serverContent: string;
  serverTitle: string;
  /** Quién hizo el último cambio, si se sabe. */
  serverAuthor: string | null;
}

export interface SectionSaveState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Versión guardada en el servidor, si se ha guardado. */
  savedVersion?: number | null;
  analysisTaskId?: string | null;
  /** El servidor ha pospuesto el guardado automático. */
  throttled?: boolean;
  retryAfterMs?: number;
  /** El servidor tiene otra versión. */
  conflict?: SectionConflict | null;
}

export interface SyncMachine {
  state: EditorSyncState;
  /** Versión del servidor conocida. */
  serverVersion: number;
  /** Versión local: cuenta cada cambio, para ordenarlos. */
  localVersion: number;
  /** Intentos fallidos consecutivos. */
  attempts: number;
  /** Quedan cambios sin confirmar por el servidor. */
  pending: boolean;
  /** Último mensaje para la persona que escribe. */
  message: string | null;
  /** Espera hasta el siguiente reintento, en milisegundos. */
  retryInMs: number | null;
  /** Última escritura local confirmada; false incluye el respaldo solo en memoria. */
  localPersisted?: boolean;
}

export type SyncEvent =
  /** La persona ha escrito algo. */
  | { type: "edit" }
  /** El borrador ya está en el equipo. */
  | { type: "local-saved"; persisted?: boolean }
  /** Empieza el envío al servidor. */
  | { type: "sync-start" }
  /** El servidor ha confirmado el guardado. */
  | { type: "sync-ok"; version: number }
  /** El servidor ha pospuesto el guardado automático. */
  | { type: "sync-throttled"; retryAfterMs?: number }
  /** No hay conexión. */
  | { type: "sync-offline" }
  /** El servidor ha fallado. */
  | { type: "sync-error"; message?: string }
  /** El servidor tiene otra versión. */
  | { type: "sync-conflict" }
  /** Se ha recuperado un borrador del equipo. */
  | { type: "recovered" };

/** Espera máxima entre reintentos, en milisegundos. */
export const MAX_RETRY_MS = 60_000;

/** Espera base entre reintentos, en milisegundos. */
export const BASE_RETRY_MS = 2_000;

/**
 * Espera para el siguiente reintento, con crecimiento exponencial.
 *
 * El factor aleatorio evita que varias pestañas reintenten a la vez y
 * golpeen al servidor a la vez.
 */
export function retryDelay(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.min(attempts, 5);
  const base = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** exponent);
  const jitter = 0.75 + random() * 0.5;

  return Math.round(base * jitter);
}

/** Estado inicial de la máquina. */
export function initialSyncMachine(serverVersion: number): SyncMachine {
  return {
    state: "idle",
    serverVersion,
    localVersion: 0,
    attempts: 0,
    pending: false,
    message: null,
    retryInMs: null,
  };
}

/** Texto que se muestra a la persona que escribe. */
export function statusMessage(machine: SyncMachine): string {
  if (
    machine.pending &&
    machine.localPersisted === false &&
    machine.state !== "syncing" &&
    machine.state !== "conflict"
  ) {
    return "El borrador solo está en memoria. Mantén esta pestaña abierta hasta confirmar el guardado en el servidor.";
  }
  switch (machine.state) {
    case "idle":
      return "Todo guardado.";
    case "local":
      return "Guardado en este equipo. Falta enviarlo al servidor.";
    case "syncing":
      return "Sincronizando con el servidor…";
    case "synced":
      return "Guardado en el servidor.";
    case "offline":
      return "Sin conexión. El texto está guardado en este equipo y se enviará al recuperar la red.";
    case "error":
      return machine.message ?? "No se ha podido guardar en el servidor. Se reintentará.";
    case "conflict":
      return "El servidor tiene una versión más reciente. Elige cuál conservar.";
  }
}

/** Aplica un suceso a la máquina. */
export function reduceSync(machine: SyncMachine, event: SyncEvent): SyncMachine {
  switch (event.type) {
    case "edit":
      return {
        ...machine,
        state: "local",
        localVersion: machine.localVersion + 1,
        pending: true,
        attempts: 0,
        retryInMs: null,
        message: null,
        localPersisted: false,
      };

    case "local-saved":
      // Un respaldo local nunca resuelve conflictos ni confirma el servidor.
      // React debe poder omitir este evento si no cambió nada: un objeto nuevo
      // reinstalaría el debounce de servidor cada 700 ms y lo pospondría sin fin.
      if (machine.localPersisted === (event.persisted ?? true)) return machine;
      return { ...machine, localPersisted: event.persisted ?? true };

    case "sync-start":
      return { ...machine, state: "syncing", message: null };

    case "sync-ok":
      return {
        ...machine,
        state: "synced",
        serverVersion: event.version,
        pending: false,
        attempts: 0,
        retryInMs: null,
        message: null,
      };

    case "sync-throttled":
      // El servidor ha pospuesto el guardado: el texto sigue pendiente.
      return {
        ...machine,
        state: "local",
        pending: true,
        retryInMs: Math.max(0, event.retryAfterMs ?? AUTOSAVE_MIN_INTERVAL_MS),
      };

    case "sync-offline":
      return {
        ...machine,
        state: "offline",
        pending: machine.pending,
        attempts: machine.attempts + 1,
        retryInMs: retryDelay(machine.attempts),
        message: null,
      };

    case "sync-error":
      return {
        ...machine,
        state: "error",
        pending: true,
        attempts: machine.attempts + 1,
        retryInMs: retryDelay(machine.attempts),
        message: event.message ?? null,
      };

    case "sync-conflict":
      return {
        ...machine,
        state: "conflict",
        pending: true,
        retryInMs: null,
        message: null,
      };

    case "recovered":
      return {
        ...machine,
        state: "local",
        localVersion: machine.localVersion + 1,
        pending: true,
        attempts: 0,
        retryInMs: null,
        message: null,
      };
  }
}

/**
 * Indica si la máquina tiene que intentar sincronizar.
 *
 * Solo se sincroniza si hay algo pendiente, no hay conflicto y no se está
 * syncing ya. Un conflicto espera a que la persona decida.
 */
export function shouldSync(machine: SyncMachine): boolean {
  return machine.pending && machine.state !== "syncing" && machine.state !== "conflict";
}

/** Indica si el editor debe avisar de que hay trabajo sin guardar. */
export function hasUnsavedWork(machine: SyncMachine): boolean {
  return machine.pending;
}
