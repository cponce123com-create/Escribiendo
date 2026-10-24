"use client";

import { useSyncExternalStore } from "react";

/**
 * Preferencias de escritura.
 *
 * Se guardan en el navegador, no en el servidor: son ajustes de la persona
 * que escribe, no del estudio, y no deben viajar a ningún sitio.
 *
 * El estado vive fuera de React (`localStorage`), así que se lee con
 * `useSyncExternalStore`: durante el renderizado en el servidor se usa el
 * valor por defecto y el cliente adopta el guardado, sin desajuste de
 * hidratación.
 */

export interface WritingPreferences {
  /** Tamaño del texto del manuscrito, en píxeles. */
  fontSize: number;
  /** Interlineado, como múltiplo del tamaño de letra. */
  lineHeight: number;
  /** Oculta el panel lateral para ampliar la superficie de escritura. */
  focusMode: boolean;
  /** Reglas editoriales activadas, guardadas solo en este navegador. */
  editorialRulesEnabled: Record<string, boolean>;
}

export const EDITORIAL_RULE_OPTIONS = [
  { id: "local-proofreader/repeated-word", label: "Palabras repetidas" },
  { id: "local-proofreader/spacing", label: "Espacios y puntuación" },
  { id: "local-proofreader/punctuation", label: "Signos repetidos" },
  { id: "local-proofreader/capitalization", label: "Mayúsculas al comenzar oración" },
  { id: "local-proofreader/common-typo", label: "Errores ortográficos frecuentes" },
] as const;

export const DEFAULT_WRITING_PREFERENCES: WritingPreferences = {
  fontSize: 17,
  lineHeight: 1.85,
  focusMode: false,
  editorialRulesEnabled: {},
};

const STORAGE_KEY = "escribiendo-writing-preferences";

type Listener = () => void;

const listeners = new Set<Listener>();

let snapshot: WritingPreferences = DEFAULT_WRITING_PREFERENCES;
let snapshotRaw: string | null | undefined;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

export function parseWritingPreferences(raw: string | null): WritingPreferences {
  if (!raw) {
    return DEFAULT_WRITING_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WritingPreferences>;
    const editorialRulesEnabled =
      parsed.editorialRulesEnabled &&
      typeof parsed.editorialRulesEnabled === "object" &&
      !Array.isArray(parsed.editorialRulesEnabled)
        ? Object.fromEntries(
            Object.entries(parsed.editorialRulesEnabled).filter(
              (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
            ),
          )
        : {};

    return {
      fontSize: clamp(parsed.fontSize, 14, 26, DEFAULT_WRITING_PREFERENCES.fontSize),
      lineHeight: clamp(parsed.lineHeight, 1.4, 2.4, DEFAULT_WRITING_PREFERENCES.lineHeight),
      focusMode: Boolean(parsed.focusMode),
      editorialRulesEnabled,
    };
  } catch {
    return DEFAULT_WRITING_PREFERENCES;
  }
}

/** Aplica las preferencias al documento, para que las use el CSS. */
export function applyWritingPreferences(preferences: WritingPreferences): void {
  const root = document.documentElement;

  root.style.setProperty("--writing-font-size", `${preferences.fontSize}px`);
  root.style.setProperty("--writing-line-height", String(preferences.lineHeight));
  root.dataset.focusMode = preferences.focusMode ? "true" : "false";
}

function getSnapshot(): WritingPreferences {
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshot = parseWritingPreferences(raw);
  }

  return snapshot;
}

function getServerSnapshot(): WritingPreferences {
  return DEFAULT_WRITING_PREFERENCES;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Guarda las preferencias y avisa a los suscriptores. */
export function writeWritingPreferences(preferences: WritingPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Si el almacenamiento no está disponible, el ajuste solo dura esta
    // sesión. No es motivo para interrumpir la escritura.
  }

  applyWritingPreferences(preferences);
  snapshotRaw = undefined;

  for (const listener of listeners) {
    listener();
  }
}

/** Lee las preferencias guardadas, con los valores por defecto como respaldo. */
export function readWritingPreferences(): WritingPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_WRITING_PREFERENCES;
  }

  return getSnapshot();
}

/**
 * Panel de preferencias de escritura.
 *
 * Se guarda en cuanto cambia un control, sin necesidad de un botón de
 * guardar: la escritura no debería interrumpirse por un ajuste.
 */
export function WritingPreferencesPanel() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = (changes: Partial<WritingPreferences>): void => {
    writeWritingPreferences({ ...preferences, ...changes });
  };

  return (
    <section className="panel p-6" aria-label="preferencias de escritura">
      <p className="meta-label">Preferencias</p>
      <h2 className="mt-1.5 font-serif text-2xl text-ink">Cómo escribes</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Se guardan en este navegador y solo te afectan a ti.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <label className="field-label" htmlFor="pref-font-size">
            Tamaño del texto: {preferences.fontSize} px
          </label>
          <input
            id="pref-font-size"
            type="range"
            min={14}
            max={26}
            step={1}
            value={preferences.fontSize}
            onChange={(event) => update({ fontSize: Number(event.target.value) })}
            className="mt-2 w-full"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="pref-line-height">
            Interlineado: {preferences.lineHeight.toFixed(2)}
          </label>
          <input
            id="pref-line-height"
            type="range"
            min={1.4}
            max={2.4}
            step={0.05}
            value={preferences.lineHeight}
            onChange={(event) => update({ lineHeight: Number(event.target.value) })}
            className="mt-2 w-full"
          />
        </div>

        <label className="flex items-center gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={preferences.focusMode}
            onChange={(event) => update({ focusMode: event.target.checked })}
            className="size-4"
          />
          Modo concentración (oculta el panel lateral mientras escribes)
        </label>

        <fieldset className="space-y-3 border-t border-line pt-4">
          <legend className="field-label">Reglas de revisión local</legend>
          <p className="text-sm leading-relaxed text-ink-muted">
            Se ejecutan en este dispositivo. Puedes activar o desactivar cada grupo.
          </p>
          {EDITORIAL_RULE_OPTIONS.map((rule) => (
            <label key={rule.id} className="flex items-center gap-3 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={preferences.editorialRulesEnabled[rule.id] ?? true}
                onChange={(event) =>
                  update({
                    editorialRulesEnabled: {
                      ...preferences.editorialRulesEnabled,
                      [rule.id]: event.target.checked,
                    },
                  })
                }
                className="size-4"
              />
              {rule.label}
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
