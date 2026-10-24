"use client";
import { createContext, useContext, useId, useState, type ReactNode } from "react";

const FilterContext = createContext({ query: "", severity: "all" });
export function ObservationFilters({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const id = useId();
  return (
    <FilterContext.Provider value={{ query, severity }}>
      <div
        className="mt-4 grid gap-3 sm:grid-cols-2"
        role="group"
        aria-label="Filtrar observaciones"
      >
        <div>
          <label className="field-label" htmlFor={`${id}-query`}>
            Buscar observación
          </label>
          <input
            id={`${id}-query`}
            className="field-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Palabra o mensaje"
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-severity`}>
            Nivel de observación
          </label>
          <select
            id={`${id}-severity`}
            className="field-input"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value="all">Todos los niveles</option>
            <option value="info">Informativa</option>
            <option value="warning">Advertencia</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Los filtros se aplican a las observaciones mostradas en este panel.
      </p>
      {children}
    </FilterContext.Provider>
  );
}
export function useObservationVisible(text: string, severity: string) {
  const filters = useContext(FilterContext);
  return (
    (filters.severity === "all" || severity === filters.severity) &&
    text
      .normalize("NFC")
      .toLocaleLowerCase("es")
      .includes(filters.query.normalize("NFC").toLocaleLowerCase("es").trim())
  );
}
