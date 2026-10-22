/**
 * Posición de lectura de una sección del manuscrito.
 *
 * Al volver al libro y abrir de nuevo la misma sección, la persona debe
 * encontrar el texto donde lo dejó. La posición se guarda en la sesión del
 * navegador, no en el servidor: es una preferencia de lectura, no un dato del
 * manuscrito, y no debe viajar entre dispositivos ni entre cuentas.
 */

const STORAGE_PREFIX = "escribiendo:section-scroll:";

/** Seis horas son suficientes para una sesión de trabajo normal. */
const MAX_SECTION_SCROLL_AGE_MS = 6 * 60 * 60 * 1000;

interface StoredSectionScroll {
  top: number;
  savedAt: number;
}

function storageKey(bookId: string, sectionId: string): string {
  return `${STORAGE_PREFIX}${bookId}:${sectionId}`;
}

/** Convierte una posición en el valor que se guarda en `sessionStorage`. */
export function serializeSectionScrollPosition(top: number, savedAt: number): string {
  return JSON.stringify({
    top: Math.max(0, Math.round(top)),
    savedAt,
  } satisfies StoredSectionScroll);
}

/**
 * Recupera la posición guardada.
 *
 * Se descartan los datos incompletos, los valores negativos o no finitos, las
 * posiciones antiguas y las que vienen del futuro. Así una entrada dañada no
 * puede llevar a la persona a un lugar arbitrario del documento.
 */
export function parseSectionScrollPosition(
  raw: string | null,
  now = Date.now(),
  maxAgeMs = MAX_SECTION_SCROLL_AGE_MS,
): number | null {
  if (!raw) {
    return null;
  }

  try {
    const stored = JSON.parse(raw) as Partial<StoredSectionScroll>;

    if (typeof stored.top !== "number" || !Number.isFinite(stored.top) || stored.top <= 0) {
      return null;
    }

    if (typeof stored.savedAt !== "number" || !Number.isFinite(stored.savedAt)) {
      return null;
    }

    if (stored.savedAt > now + 60_000 || now - stored.savedAt > maxAgeMs) {
      return null;
    }

    return stored.top;
  } catch {
    return null;
  }
}

/**
 * Elige la posición que hay que conservar.
 *
 * La lectura avanza, pero a veces se sube para volver a leer o para pulsar
 * «Volver al libro». Esa subida no debe borrar el punto más avanzado de la
 * sesión: al regresar, la persona quiere encontrar el lugar donde se quedó.
 */
export function pickSectionScrollPosition(current: number, previous: number | null): number | null {
  if (current <= 0) {
    return previous;
  }

  if (previous === null) {
    return current;
  }

  return current > previous ? current : previous;
}

/** Guarda la posición vertical actual sin retroceder a un punto anterior. */
export function saveSectionScrollPosition(bookId: string, sectionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = storageKey(bookId, sectionId);
    const previous = readSectionScrollPosition(bookId, sectionId);
    const next = pickSectionScrollPosition(window.scrollY, previous);

    if (next === null) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(key, serializeSectionScrollPosition(next, Date.now()));
  } catch {
    // El navegador puede bloquear `sessionStorage`. La navegación sigue
    // funcionando; solo se pierde la restauración de la posición.
  }
}

/** Devuelve la posición guardada para una sección, si sigue siendo válida. */
export function readSectionScrollPosition(bookId: string, sectionId: string): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const key = storageKey(bookId, sectionId);
    const raw = window.sessionStorage.getItem(key);
    const position = parseSectionScrollPosition(raw);

    if (position === null && raw !== null) {
      window.sessionStorage.removeItem(key);
    }

    return position;
  } catch {
    return null;
  }
}
