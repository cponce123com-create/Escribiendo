/**
 * Borradores locales del manuscrito.
 *
 * El editor guarda una copia del texto en el navegador antes de enviarla al
 * servidor. Si la conexión se cae, si el equipo se suspende o si se cierra la
 * pestaña a mitad de una frase, el trabajo sigue ahí y se puede recuperar.
 *
 * Se usa **IndexedDB** y no `localStorage` por dos razones: un manuscrito
 * completo no cabe cómodamente en `localStorage` (su límite son unos 5 MB y es
 * síncrono, así que bloquea el hilo principal), e IndexedDB permite guardar
 * estructuras sin convertirlas a texto.
 *
 * Privacidad: los borradores son de la persona que escribe y viven en su
 * navegador. En un equipo compartido, quien pueda usar el mismo perfil del
 * sistema operativo podría abrirlos desde las herramientas del navegador.
 * Por eso el borrador se identifica con el identificador de la cuenta y solo
 * se recuperan los de esa cuenta.
 */

export type DraftSyncState = "local" | "syncing" | "synced" | "conflict";

export interface DraftRecord {
  /** Clave: cuenta, libro y sección. */
  key: string;
  userId: string;
  bookId: string;
  sectionId: string;
  /** Versión del servidor sobre la que se editó. */
  baseVersion: number;
  /** Versión local, para ordenar los cambios. */
  localVersion: number;
  /** Contenido del documento Tiptap, en JSON. */
  content: string;
  /** Fecha de la última modificación local, en ISO. */
  updatedAt: string;
  /** Estado de la sincronización con el servidor. */
  syncState: DraftSyncState;
  /** Versión del servidor en el momento de la última sincronización. */
  serverVersion: number;
}

const DATABASE_NAME = "escribiendo-borradores";
const DATABASE_VERSION = 1;
const STORE_NAME = "borradores";

/** Estado de la memoria, usado cuando IndexedDB no está disponible. */
const memoria = new Map<string, DraftRecord>();

function clave(userId: string, bookId: string, sectionId: string): string {
  return `${userId}:${bookId}:${sectionId}`;
}

/** Indica si el navegador puede usar IndexedDB. */
export function indexedDbDisponible(): boolean {
  return typeof indexedDB !== "undefined";
}

function abrir(): Promise<IDBDatabase | null> {
  if (!indexedDbDisponible()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let peticion: IDBOpenDBRequest;

    try {
      peticion = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }

    peticion.onupgradeneeded = () => {
      const db = peticion.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("bookId", "bookId", { unique: false });
        store.createIndex("userId", "userId", { unique: false });
      }
    };

    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => resolve(null);
    peticion.onblocked = () => resolve(null);
  });
}

function transaccion<T>(
  db: IDBDatabase,
  modo: IDBTransactionMode,
  operacion: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, modo);
      const peticion = operacion(tx.objectStore(STORE_NAME));

      peticion.onsuccess = () => resolve(peticion.result);
      peticion.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Guarda un borrador.
 *
 * Devuelve `true` si se ha escrito en el almacén persistente. Si no es
 * posible, el borrador queda solo en memoria, que sirve mientras la pestaña
 * siga abierta.
 */
export async function saveDraft(record: DraftRecord): Promise<boolean> {
  memoria.set(record.key, record);

  const db = await abrir();

  if (!db) {
    return false;
  }

  const resultado = await transaccion(db, "readwrite", (store) => store.put(record));

  db.close();

  return resultado !== null;
}

/** Recupera el borrador de una sección. */
export async function loadDraft(
  userId: string,
  bookId: string,
  sectionId: string,
): Promise<DraftRecord | null> {
  const key = clave(userId, bookId, sectionId);

  const db = await abrir();

  if (!db) {
    return memoria.get(key) ?? null;
  }

  const resultado = await transaccion<DraftRecord>(db, "readonly", (store) => store.get(key));

  db.close();

  return resultado ?? memoria.get(key) ?? null;
}

/** Borra el borrador de una sección. */
export async function deleteDraft(
  userId: string,
  bookId: string,
  sectionId: string,
): Promise<void> {
  const key = clave(userId, bookId, sectionId);

  memoria.delete(key);

  const db = await abrir();

  if (!db) {
    return;
  }

  await transaccion(db, "readwrite", (store) => store.delete(key));

  db.close();
}

/** Todos los borradores de una cuenta en un libro. */
export async function listDrafts(userId: string, bookId: string): Promise<DraftRecord[]> {
  const db = await abrir();
  const registros: DraftRecord[] = [];

  if (db) {
    const indices = await transaccion<DraftRecord[]>(db, "readonly", (store) =>
      store.index("bookId").getAll(bookId),
    );

    db.close();

    for (const registro of indices ?? []) {
      if (registro.userId === userId) {
        registros.push(registro);
      }
    }
  }

  if (registros.length === 0) {
    for (const registro of memoria.values()) {
      if (registro.userId === userId && registro.bookId === bookId) {
        registros.push(registro);
      }
    }
  }

  return registros.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/** Borra todos los borradores de una cuenta en un libro. */
export async function clearDrafts(userId: string, bookId: string): Promise<void> {
  const borradores = await listDrafts(userId, bookId);

  for (const borrador of borradores) {
    await deleteDraft(userId, bookId, borrador.sectionId);
  }
}
