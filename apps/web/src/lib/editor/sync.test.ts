import { describe, expect, it } from "vitest";
import {
  BASE_RETRY_MS,
  MAX_RETRY_MS,
  hasUnsavedWork,
  initialSyncMachine,
  reduceSync,
  retryDelay,
  shouldSync,
  statusMessage,
  type SyncMachine,
} from "./sync";

describe("initialSyncMachine", () => {
  it("arranca en reposo con la versión del servidor", () => {
    const machine = initialSyncMachine(7);

    expect(machine.state).toBe("idle");
    expect(machine.serverVersion).toBe(7);
    expect(machine.pending).toBe(false);
    expect(machine.attempts).toBe(0);
  });
});

describe("reduceSync", () => {
  it("al escribir pasa a «en el equipo» y queda pendiente", () => {
    const machine = reduceSync(initialSyncMachine(1), { type: "edit" });

    expect(machine.state).toBe("local");
    expect(machine.pending).toBe(true);
    expect(machine.localVersion).toBe(1);
  });

  it("el guardado local no cambia un estado sincronizado", () => {
    const sincronizado = reduceSync(initialSyncMachine(1), {
      type: "sync-ok",
      version: 2,
    });
    const machine = reduceSync(sincronizado, { type: "local-saved" });

    expect(machine.state).toBe("synced");
  });

  it("el guardado local saca del estado de error sin perder lo pendiente", () => {
    const conError = reduceSync(initialSyncMachine(1), { type: "sync-error" });
    const machine = reduceSync(conError, { type: "local-saved" });

    expect(machine.state).toBe("local");
    expect(machine.pending).toBe(true);
  });

  it("al confirmar, la versión del servidor avanza y no queda pendiente", () => {
    const machine = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-ok",
      version: 2,
    });

    expect(machine.state).toBe("synced");
    expect(machine.serverVersion).toBe(2);
    expect(machine.pending).toBe(false);
    expect(machine.attempts).toBe(0);
  });

  it("un guardado pospuesto por el servidor deja el texto pendiente", () => {
    const machine = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-throttled",
      retryAfterMs: 41000,
    });

    expect(machine.state).toBe("local");
    expect(machine.pending).toBe(true);
    expect(machine.retryInMs).toBe(41000);
  });

  it("sin conexión, el texto sigue pendiente y se programa un reintento", () => {
    const machine = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-offline",
    });

    expect(machine.state).toBe("offline");
    expect(machine.pending).toBe(true);
    expect(machine.retryInMs).not.toBeNull();
  });

  it("un error cuenta el intento y programa un reintento", () => {
    const machine = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-error",
      message: "No se ha podido guardar.",
    });

    expect(machine.state).toBe("error");
    expect(machine.attempts).toBe(1);
    expect(machine.message).toBe("No se ha podido guardar.");
  });

  it("el conflicto detiene la sincronización hasta que la persona decida", () => {
    const machine = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-conflict",
    });

    expect(machine.state).toBe("conflict");
    expect(machine.pending).toBe(true);
    expect(shouldSync(machine)).toBe(false);
  });

  it("recuperar un borrador lo deja pendiente de enviar", () => {
    const machine = reduceSync(initialSyncMachine(1), { type: "recovered" });

    expect(machine.state).toBe("local");
    expect(machine.pending).toBe(true);
  });

  it("escribir durante una sincronización deja el texto pendiente", () => {
    // Este es el caso que antes marcaba como guardado un texto que no lo
    // estaba: la respuesta del servidor confirmaba una versión anterior.
    const enCurso = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-start",
    });
    const escribiendo = reduceSync(enCurso, { type: "edit" });
    const confirmado = reduceSync(escribiendo, { type: "sync-ok", version: 2 });

    // Tras la confirmación, lo que se escribió durante el envío sigue
    // pendiente: el editor debe volver a marcarlo.
    const final = reduceSync(confirmado, { type: "edit" });

    expect(final.pending).toBe(true);
    expect(final.state).toBe("local");
  });
});

describe("shouldSync", () => {
  const base = initialSyncMachine(1);

  it("no sincroniza si no hay nada pendiente", () => {
    expect(shouldSync(base)).toBe(false);
  });

  it("sincroniza cuando hay cambios pendientes", () => {
    expect(shouldSync(reduceSync(base, { type: "edit" }))).toBe(true);
  });

  it("no sincroniza mientras ya está sincronizando", () => {
    const enCurso = reduceSync(reduceSync(base, { type: "edit" }), { type: "sync-start" });

    expect(shouldSync(enCurso)).toBe(false);
  });

  it("no sincroniza sin conexión", () => {
    const sinRed = reduceSync(reduceSync(base, { type: "edit" }), { type: "sync-offline" });

    expect(shouldSync(sinRed)).toBe(false);
  });
});

describe("retryDelay", () => {
  it("crece con los intentos", () => {
    const sinAleatoriedad = (): number => 0.5;

    const primera = retryDelay(0, sinAleatoriedad);
    const segunda = retryDelay(1, sinAleatoriedad);
    const tercera = retryDelay(2, sinAleatoriedad);

    expect(segunda).toBeGreaterThan(primera);
    expect(tercera).toBeGreaterThan(segunda);
  });

  it("no supera el máximo", () => {
    expect(retryDelay(20, () => 1)).toBeLessThanOrEqual(MAX_RETRY_MS * 1.25);
  });

  it("la primera espera es la base", () => {
    expect(retryDelay(0, () => 0.5)).toBe(BASE_RETRY_MS);
  });
});

describe("statusMessage", () => {
  it("cada estado tiene un mensaje propio", () => {
    const estados: SyncMachine["state"][] = [
      "idle",
      "local",
      "syncing",
      "synced",
      "offline",
      "error",
      "conflict",
    ];

    for (const estado of estados) {
      const machine: SyncMachine = { ...initialSyncMachine(1), state: estado };

      expect(statusMessage(machine).length).toBeGreaterThan(0);
    }
  });

  it("no dice «guardado» mientras no lo está", () => {
    const maquina = reduceSync(initialSyncMachine(1), { type: "edit" });

    expect(statusMessage(maquina)).not.toContain("Guardado en el servidor.");
  });
});

describe("hasUnsavedWork", () => {
  it("detecta el trabajo sin confirmar", () => {
    expect(hasUnsavedWork(reduceSync(initialSyncMachine(1), { type: "edit" }))).toBe(true);
  });

  it("no avisa cuando todo está confirmado", () => {
    const maquina = reduceSync(reduceSync(initialSyncMachine(1), { type: "edit" }), {
      type: "sync-ok",
      version: 2,
    });

    expect(hasUnsavedWork(maquina)).toBe(false);
  });
});
