"use client";

import { useObservationVisible } from "./observation-filters";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";

const IGNORE_CHANGE_EVENT = "escribiendo:analysis-ignore-change";
type ReviewStatus = "open" | "ignored" | "intentional" | "resolved";
const memoryStatuses = new Map<string, ReviewStatus>();

export function IgnoreAnalysisObservation({
  storageKey,
  title,
  children,
  severity = "info",
  searchText = "",
}: {
  storageKey: string;
  title: string;
  children: ReactNode;
  severity?: string;
  searchText?: string;
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
      const value = window.localStorage.getItem(storageKey);
      return value === "ignored" || value === "intentional" || value === "resolved"
        ? value
        : "open";
    } catch {
      return memoryStatuses.get(storageKey) ?? "open";
    }
  }, [storageKey]);

  const status = useSyncExternalStore(subscribe, getSnapshot, () => "open");
  const visible = useObservationVisible(`${title} ${searchText}`, severity);

  function setIgnoredAndPersist(nextValue: ReviewStatus) {
    if (nextValue !== "open") memoryStatuses.set(storageKey, nextValue);
    else memoryStatuses.delete(storageKey);
    try {
      if (nextValue !== "open") window.localStorage.setItem(storageKey, nextValue);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // El estado en memoria conserva la función si el navegador bloquea localStorage.
    }
    window.dispatchEvent(new CustomEvent(IGNORE_CHANGE_EVENT, { detail: storageKey }));
  }

  return (
    <li className="list-none" hidden={!visible}>
      {status !== "open" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-ink/5 p-4 text-sm">
          <p className="text-ink-muted">
            {status === "ignored"
              ? "Observación ignorada"
              : status === "intentional"
                ? "Recurso intencional"
                : "Observación resuelta"}
            : {title}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIgnoredAndPersist("open")}
          >
            Deshacer
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIgnoredAndPersist("intentional")}
            >
              Marcar como intencional
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIgnoredAndPersist("resolved")}
            >
              Marcar como resuelta
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={`Ignorar observación: ${title}`}
              onClick={() => setIgnoredAndPersist("ignored")}
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
