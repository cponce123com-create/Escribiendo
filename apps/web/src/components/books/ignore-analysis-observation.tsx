"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";

const IGNORE_CHANGE_EVENT = "escribiendo:analysis-ignore-change";
const memoryIgnoredKeys = new Set<string>();

export function IgnoreAnalysisObservation({
  storageKey,
  title,
  children,
}: {
  storageKey: string;
  title: string;
  children: ReactNode;
}) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) onStoreChange();
      };
      const onLocalChange = (event: Event) => {
        if (event instanceof CustomEvent && event.detail === storageKey) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(IGNORE_CHANGE_EVENT, onLocalChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(IGNORE_CHANGE_EVENT, onLocalChange);
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey) === "ignored";
    } catch {
      return memoryIgnoredKeys.has(storageKey);
    }
  }, [storageKey]);

  const ignored = useSyncExternalStore(subscribe, getSnapshot, () => false);

  function setIgnoredAndPersist(nextValue: boolean) {
    if (nextValue) memoryIgnoredKeys.add(storageKey);
    else memoryIgnoredKeys.delete(storageKey);
    try {
      if (nextValue) window.localStorage.setItem(storageKey, "ignored");
      else window.localStorage.removeItem(storageKey);
    } catch {
      // El estado en memoria conserva la función si el navegador bloquea localStorage.
    }
    window.dispatchEvent(new CustomEvent(IGNORE_CHANGE_EVENT, { detail: storageKey }));
  }

  return (
    <li className="list-none">
      {ignored ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-ink/5 p-4 text-sm">
          <p className="text-ink-muted">Observación ignorada: {title}</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIgnoredAndPersist(false)}
          >
            Deshacer
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={`Ignorar observación: ${title}`}
              onClick={() => setIgnoredAndPersist(true)}
            >
              Ignorar
            </button>
          </div>
          {children}
        </div>
      )}
    </li>
  );
}
